// Telegram signup verification — the real replacement for the hard-coded "1111".
//
// FLOW
//   1. Browser calls POST /api/verify/start  -> gets a nonce and a t.me deep link.
//   2. Visitor opens the link, presses Start, taps "Share my number".
//   3. Telegram POSTs the contact to our webhook; we record the phone against the nonce.
//   4. Browser polls GET /api/verify/status until it flips to `verified`.
//   5. POST /api/signup passes the nonce; the phone is read FROM THE DATABASE.
//
// WHY NOT AN OTP
// A bot cannot message a phone number — the Bot API has no such method, since
// sendMessage needs a chat_id that only exists after the user has contacted the bot.
// Telegram's paid Gateway API can send codes to numbers, but contact-sharing is both
// free and stronger: the number arrives from Telegram's own records, so there is no
// code in flight to intercept and no ~10^4 answer space to brute-force.
//
// A DEDICATED BOT, NOT THE BUSINESS BOT
// A bot has exactly one webhook. Pointing the business bot's webhook here would take
// its updates away from the bot service that owns it. So this needs its own bot from
// @BotFather and its own token in VERIFY_BOT_TOKEN.

const NONCE_TTL_MS = 15 * 60 * 1000;

/** Wide enough that a caretaker filling a form is never rushed, short enough to bound replay. */
const NONCE_TTL_SECONDS = NONCE_TTL_MS / 1000;

/** Per-Telegram-account cap on verifications in a rolling window. */
const MAX_PER_TELEGRAM_ACCOUNT = 5;
const TELEGRAM_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

async function recentCountForAccount(db: D1Database, telegramId: number) {
  const since = nowSeconds() - TELEGRAM_ACCOUNT_WINDOW_MS / 1000;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM signup_verification WHERE telegram_id = ? AND created_at >= ?")
    .bind(telegramId, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export type VerifyOutcome =
  | { ok: true; phone: string }
  | { ok: false; reason: "unknown_nonce" | "expired" | "already_used" | "rate_limited" };

/**
 * Bind a shared contact to a pending nonce.
 *
 * The caller MUST have already confirmed the contact belongs to the sender — see
 * contactBelongsToSender(). Everything downstream trusts `phone`.
 */
export async function markVerified(
  db: D1Database,
  nonce: string,
  phone: string,
  telegramId: number
): Promise<VerifyOutcome> {
  const row = await getVerification(db, nonce);
  if (!row) return { ok: false, reason: "unknown_nonce" };
  if (row.status === "consumed") return { ok: false, reason: "already_used" };
  if (row.expires_at < nowSeconds()) return { ok: false, reason: "expired" };

  if ((await recentCountForAccount(db, telegramId)) >= MAX_PER_TELEGRAM_ACCOUNT) {
    return { ok: false, reason: "rate_limited" };
  }

  // Guarded on status so two rapid contact shares cannot both "win" and overwrite the
  // phone; the second becomes a no-op and returns the number already recorded.
  await db
    .prepare(
      `UPDATE signup_verification
       SET status = 'verified', phone = ?, telegram_id = ?, verified_at = ?
       WHERE nonce = ? AND status = 'pending'`
    )
    .bind(phone, telegramId, nowSeconds(), nonce)
    .run();

  const refreshed = await getVerification(db, nonce);
  return { ok: true, phone: refreshed?.phone ?? phone };
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

// ─────────────────────────────────────────────────────────── Telegram webhook types

export type TelegramContact = {
  phone_number?: string;
  user_id?: number;
};

export type TelegramUpdate = {
  message?: {
    message_id?: number;
    from?: { id?: number; language_code?: string };
    chat?: { id?: number };
    text?: string;
    contact?: TelegramContact;
  };
};

/**
 * THE critical check.
 *
 * Telegram lets anyone forward a contact card from their address book, and such a
 * message arrives looking almost identical to "I shared my own number" — the only
 * difference is that contact.user_id is absent or belongs to somebody else. Without
 * this comparison a visitor could verify a number they do not control simply by
 * forwarding a friend's contact.
 */
export function contactBelongsToSender(contact: TelegramContact | undefined, senderId: number | undefined) {
  if (!contact?.phone_number || !contact.user_id || !senderId) return false;
  return Number(contact.user_id) === Number(senderId);
}

/** `/start <payload>` → payload. Returns null for a bare /start or any other text. */
export function parseStartPayload(text: string | undefined) {
  const match = String(text ?? "").match(/^\/start(?:@\w+)?\s+(\S+)$/);
  if (!match) return null;
  const payload = match[1];
  return /^[A-Za-z0-9_-]{1,64}$/.test(payload) ? payload : null;
}
