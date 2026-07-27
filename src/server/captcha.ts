// Signup captcha: a small arithmetic problem drawn as a noisy SVG.
//
// Deliberately self-contained — it does NOT import the private helpers in
// ./auth.ts, because that file is mirrored into
// easyqueue-business-bot/src/utils/crm-auth.ts and CLAUDE.md requires the two to
// stay in sync. Exporting new symbols from there would create a sync obligation
// the bot has no use for.
//
// WHAT THIS DOES AND DOESN'T BUY YOU
// It stops casual form-spam against POST /api/signup, which is unauthenticated,
// CORS-open, and creates rows. It is NOT bot-proof: the SVG is client-rendered, so
// anything willing to parse vector paths can read the digits. Two properties keep
// it honest anyway:
//   - the answer is never in the token (the problem is DERIVED from a signed nonce),
//     so the token cannot be decoded to reveal it; and
//   - each nonce is burned in D1 on the first verification ATTEMPT, so a token
//     cannot be replayed to brute-force the ~35-value answer space.

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_TTL_SECONDS = CAPTCHA_TTL_MS / 1000;

/** Domain separation: a captcha token must never verify as a session token. */
const CAPTCHA_KEY_INFO = "easyq-captcha-v1";

export type CaptchaFailure = "captcha_invalid" | "captcha_expired" | "captcha_replay";
export type CaptchaResult = { ok: true } | { ok: false; code: CaptchaFailure };

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8ToBase64Url(value: string) {
  return toBase64Url(new TextEncoder().encode(value));
}

function base64UrlToUtf8(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/** Mirrors the dev fallback in ./auth.ts:getSessionSecret so local dev works unconfigured. */
function getCaptchaSecret(request: Request, configuredSecret?: string) {
  const base = configuredSecret?.trim();
  if (base) return `${base}::${CAPTCHA_KEY_INFO}`;

  const { hostname } = new URL(request.url);
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `easyq-crm-dev-session-secret::${CAPTCHA_KEY_INFO}`;
  }

  throw new Error("CRM_SESSION_SECRET is missing. Set it in the easyq-crm Worker secrets before using the signup captcha.");
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

type Problem = { a: number; b: number; op: "+" | "-"; answer: number };

/**
 * The problem is derived from the nonce rather than stored in the token.
 * base64url is encoding, not encryption — anything placed in the payload is public.
 */
async function deriveProblem(secret: string, nonce: string): Promise<Problem> {
  const digest = await hmac(secret, `captcha-problem:${nonce}`);

  if (digest[0] % 2 === 0) {
    const a = 2 + (digest[1] % 18); // 2..19
    const b = 2 + (digest[2] % 18); // 2..19
    return { a, b, op: "+", answer: a + b };
  }

  const a = 6 + (digest[1] % 14); // 6..19
  const b = 1 + (digest[2] % 5); //  1..5   — always a positive result
  return { a, b, op: "-", answer: a - b };
}

// ---------------------------------------------------------------- SVG drawing

/**
 * Seven-segment strokes in a 20x34 box. Drawing glyphs as <line> paths rather than
 * <text> matters: a <text> element would put the answer in the SVG source in plain
 * text, which defeats the whole exercise.
 */
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [2, 1, 18, 1],
  b: [19, 2, 19, 16],
  c: [19, 18, 19, 32],
  d: [2, 33, 18, 33],
  e: [1, 18, 1, 32],
  f: [1, 2, 1, 16],
  g: [2, 17, 18, 17],
};

/** Extra strokes that make a glyph readable once it is rotated and skewed. */
const GLYPH_EXTRAS: Record<string, string> = {
  // Bare "b+c" reads as a slash at an angle; the flag and foot make it a 1.
  "1": '<line x1="13" y1="6" x2="19" y2="2"/><line x1="13" y1="33" x2="19" y2="33"/>',
};

const DIGIT_SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "c", "d", "g"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

const INK = ["#1f2937", "#111827", "#374151", "#4b5563"];

function randomBytes(count: number) {
  return crypto.getRandomValues(new Uint8Array(count));
}

function renderCaptchaSvg(problem: Problem): string {
  const text = `${problem.a}${problem.op}${problem.b}`;
  const glyphWidth = 26;
  const width = Math.max(150, text.length * glyphWidth + 26);
  const height = 62;
  const noise = randomBytes(6 + text.length * 4 + 90);
  let n = 0;
  const next = (max: number) => noise[n++ % noise.length] % max;

  const parts: string[] = [
    `<rect width="${width}" height="${height}" rx="10" fill="#f8fafc"/>`,
  ];

  // Noise behind the glyphs.
  for (let i = 0; i < 3; i += 1) {
    const y1 = 8 + next(44);
    const y2 = 8 + next(44);
    parts.push(
      `<path d="M0 ${y1} C ${width / 3} ${y1 - 14 + next(28)}, ${(width / 3) * 2} ${y2 - 14 + next(28)}, ${width} ${y2}" ` +
        `fill="none" stroke="${INK[next(INK.length)]}" stroke-width="1.3" opacity=".4"/>`
    );
  }

  let x = 14;
  for (const char of text) {
    // Enough jitter to defeat naive template matching, not so much that a human
    // has to guess: past roughly ±12° a "1" stops reading as a digit.
    const rotate = next(25) - 12;
    const skew = next(13) - 6;
    const dy = next(9) - 4;
    const stroke = (30 + next(9)) / 10;
    const color = INK[next(INK.length)];

    // "+" is the middle bar plus a vertical stroke through it; "-" is the bar alone.
    const names = char === "-" || char === "+" ? ["g"] : (DIGIT_SEGMENTS[char] ?? []);
    let body = names
      .map((name) => {
        const [x1, y1, x2, y2] = SEGMENTS[name];
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      })
      .join("");
    if (char === "+") body += `<line x1="10" y1="9" x2="10" y2="25"/>`;
    body += GLYPH_EXTRAS[char] ?? "";

    parts.push(
      `<g transform="translate(${x} ${12 + dy}) rotate(${rotate} 10 17) skewX(${skew})" ` +
        `stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" fill="none">${body}</g>`
    );
    x += glyphWidth;
  }

  // Speckle on top so the glyph edges are not cleanly separable.
  for (let i = 0; i < 55; i += 1) {
    parts.push(
      `<circle cx="${next(width)}" cy="${next(height)}" r="${1 + next(2)}" fill="${INK[next(INK.length)]}" opacity=".33"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${parts.join("")}</svg>`;
}

// ------------------------------------------------------------------ issue

export type IssuedCaptcha = { token: string; image: string; expiresIn: number };

export async function issueCaptcha(request: Request, configuredSecret?: string): Promise<IssuedCaptcha> {
  const secret = getCaptchaSecret(request, configuredSecret);
  const nonce = toBase64Url(randomBytes(16));
  const payload = utf8ToBase64Url(JSON.stringify({ n: nonce, exp: Date.now() + CAPTCHA_TTL_MS }));
  const signature = toBase64Url(await hmac(secret, payload));
  const problem = await deriveProblem(secret, nonce);
  const svg = renderCaptchaSvg(problem);

  return {
    token: `${payload}.${signature}`,
    // The SVG is pure ASCII by construction, so btoa is safe.
    image: `data:image/svg+xml;base64,${btoa(svg)}`,
    expiresIn: CAPTCHA_TTL_SECONDS,
  };
}

// ------------------------------------------------------------------ verify

/**
 * Order matters: signature and expiry are checked before D1 is touched, so junk
 * tokens cost no database work. The nonce is then burned BEFORE the answer is
 * compared — burning only on success would hand an attacker unlimited guesses
 * against a single token.
 */
export async function verifyCaptcha(
  db: D1Database,
  request: Request,
  token: string,
  answer: string,
  configuredSecret?: string
): Promise<CaptchaResult> {
  const secret = getCaptchaSecret(request, configuredSecret);

  const [payload, signature] = String(token ?? "").split(".");
  if (!payload || !signature) return { ok: false, code: "captcha_invalid" };

  const expected = toBase64Url(await hmac(secret, payload));
  if (!timingSafeEqual(signature, expected)) return { ok: false, code: "captcha_invalid" };

  let nonce: string;
  let exp: number;
  try {
    const parsed = JSON.parse(base64UrlToUtf8(payload)) as { n?: string; exp?: number };
    if (!parsed.n || typeof parsed.exp !== "number") return { ok: false, code: "captcha_invalid" };
    nonce = parsed.n;
    exp = parsed.exp;
  } catch {
    return { ok: false, code: "captcha_invalid" };
  }

  if (Date.now() > exp) return { ok: false, code: "captcha_expired" };

  // Opportunistic cleanup keeps this table at roughly one row per signup attempt
  // in the last 5 minutes.
  try {
    await db.prepare("DELETE FROM captcha_used WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)).run();
  } catch {
    // Cleanup is best-effort; never fail a signup because the purge failed.
  }

  try {
    await db
      .prepare("INSERT INTO captcha_used (jti, expires_at) VALUES (?, ?)")
      .bind(nonce, Math.floor(exp / 1000))
      .run();
  } catch {
    // PRIMARY KEY conflict — this nonce was already spent.
    return { ok: false, code: "captcha_replay" };
  }

  const problem = await deriveProblem(secret, nonce);
  const submitted = String(answer ?? "").trim();
  if (!/^-?\d{1,4}$/.test(submitted) || Number(submitted) !== problem.answer) {
    return { ok: false, code: "captcha_invalid" };
  }

  return { ok: true };
}
