// Telegram signup verification — the real replacement for the hard-coded "1111".
//
// FLOW
//   1. easyq-landing calls POST /api/verify/start -> gets a nonce and a t.me deep link.
//   2. Visitor opens the link, presses Start, taps "Share my number".
//   3. THE BUSINESS BOT receives the contact and writes the phone against the nonce.
//   4. The landing page polls GET /api/verify/status until it flips to `verified`.
//   5. POST /api/signup passes the nonce; the phone is read FROM THE DATABASE.
//
// THIS FILE OWNS HALF THE LIFECYCLE, NOT ALL OF IT
// Steps 1, 4 and 5 are ours. Step 3 belongs to easyqueue-business-bot, which binds the
// same D1 and writes `signup_verification` directly — see its
// `src/services/signup-verification.service.ts`. Nothing crosses HTTP between the two.
//
// There WAS a second implementation of step 3 here, a dedicated verification bot with
// its own webhook at /api/telegram/verify-webhook. It never worked: the deep-link
// payload is `easyq_<lang>_<nonce>` and it looked the whole string up against a column
// holding the bare nonce, so every link answered "expired". Nothing ever called it —
// the deep link this file hands out points at the BUSINESS bot, which parses the prefix
// correctly. Deleted on 2026-08-10 rather than fixed; one bot, one webhook.
//
// So: `consumeVerification` here is the final gate, and it re-checks expiry, status and
// single-use at the moment a business is actually created. A bug on the bot's side can
// fail to verify, but cannot let an unverified signup through.
//
// WHY NOT AN OTP
// A bot cannot message a phone number — the Bot API has no such method, since
// sendMessage needs a chat_id that only exists after the user has contacted the bot.
// Telegram's paid Gateway API can send codes to numbers, but contact-sharing is both
// free and stronger: the number arrives from Telegram's own records, so there is no
// code in flight to intercept and no ~10^4 answer space to brute-force.

const NONCE_TTL_MS = 15 * 60 * 1000;

/** Wide enough that a caretaker filling a form is never rushed, short enough to bound replay. */
const NONCE_TTL_SECONDS = NONCE_TTL_MS / 1000;

export type VerificationStatus = "pending" | "verified" | "consumed";

export type VerificationRow = {
  nonce: string;
  status: VerificationStatus;
  phone: string | null;
  telegram_id: number | null;
  created_at: number;
  expires_at: number;
  verified_at: number | null;
  consumed_at: number | null;
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * 128 bits of randomness. This value is the ONLY thing binding the browser that
 * started the flow to the Telegram account that finishes it, so it has to be
 * unguessable — a counter or a timestamp here would let anyone claim someone else's
 * pending verification.
 *
 * Telegram limits the /start payload to 64 characters of [A-Za-z0-9_-], which
 * base64url satisfies.
 */
export function generateNonce() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function createVerification(db: D1Database, nonce: string) {
  const created = nowSeconds();

  // Opportunistic purge; expired rows have no value and this keeps the table small.
  await db
    .prepare("DELETE FROM signup_verification WHERE expires_at < ?")
    .bind(created)
    .run()
    .catch(() => undefined);

  await db
    .prepare("INSERT INTO signup_verification (nonce, status, created_at, expires_at) VALUES (?, 'pending', ?, ?)")
    .bind(nonce, created, created + NONCE_TTL_SECONDS)
    .run();

  return { nonce, expiresIn: NONCE_TTL_SECONDS };
}

export async function getVerification(db: D1Database, nonce: string) {
  if (!nonce || nonce.length > 64) return null;
  return (
    (await db
      .prepare(
        `SELECT nonce, status, phone, telegram_id, created_at, expires_at, verified_at, consumed_at
         FROM signup_verification
         WHERE nonce = ?
         LIMIT 1`
      )
      .bind(nonce)
      .first<VerificationRow>()) ?? null
  );
}

/**
 * Expiry is enforced on read, not by a sweeper, so a lapsed row can never verify.
 *
 * Takes a non-null row and returns a plain boolean rather than a type predicate: a
 * predicate would claim the false branch means "not a VerificationRow", when in fact it
 * usually means a perfectly real row that is merely expired or spent — and callers need
 * to read `.status` off it to say which.
 */
export function isUsable(row: VerificationRow) {
  return row.expires_at >= nowSeconds() && row.status !== "consumed";
}

/**
 * Spend the nonce and hand back the verified number.
 *
 * The UPDATE is guarded on `status = 'verified'`, which makes this a compare-and-swap:
 * two concurrent signups racing the same nonce, only one sees meta.changes === 1. That
 * is what stops one Telegram confirmation from creating two businesses.
 */
export async function consumeVerification(
  db: D1Database,
  nonce: string
): Promise<{ ok: true; phone: string; telegramId: number | null } | { ok: false; reason: string }> {
  const row = await getVerification(db, nonce);
  if (!row) return { ok: false, reason: "unknown_nonce" };
  if (row.status === "consumed") return { ok: false, reason: "already_used" };
  if (row.status !== "verified" || !row.phone) return { ok: false, reason: "not_verified" };
  if (row.expires_at < nowSeconds()) return { ok: false, reason: "expired" };

  const result = await db
    .prepare("UPDATE signup_verification SET status = 'consumed', consumed_at = ? WHERE nonce = ? AND status = 'verified'")
    .bind(nowSeconds(), nonce)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    return { ok: false, reason: "already_used" };
  }

  return { ok: true, phone: row.phone, telegramId: row.telegram_id };
}

/**
 * Hand a consumed nonce back, for when creation fails after it was spent — a lost slug
 * race, say. Without this the visitor would have to redo the Telegram round trip just
 * because they picked a subdomain someone else took a moment earlier.
 *
 * Guarded on `consumed` so it can never resurrect a nonce that was legitimately used by
 * a signup that succeeded.
 */
export async function releaseVerification(db: D1Database, nonce: string) {
  await db
    .prepare("UPDATE signup_verification SET status = 'verified', consumed_at = NULL WHERE nonce = ? AND status = 'consumed'")
    .bind(nonce)
    .run()
    .catch(() => undefined);
}
