-- Telegram signup verification.
--
-- Replaces the hard-coded "1111" code that used to gate POST /api/signup. A visitor
-- opens t.me/<verify bot>?start=<nonce>, presses Start, and taps "Share my number".
-- Telegram then hands the bot a phone number IT vouches for, which is strictly better
-- than an OTP: there is no code to intercept and nothing to brute-force.
--
-- The phone lands here, and /api/signup reads it from this table rather than from the
-- request body — otherwise the whole flow would be decorative, since a client could
-- just POST any number alongside a verified nonce.

CREATE TABLE IF NOT EXISTS signup_verification (
  -- Unguessable random token. It travels through the deep link, so it is the only
  -- thing binding "the browser that asked" to "the Telegram account that answered".
  nonce TEXT PRIMARY KEY,

  -- pending -> verified -> consumed. `consumed` is terminal: it makes the nonce
  -- single-use, so one Telegram confirmation cannot create several businesses.
  status TEXT NOT NULL DEFAULT 'pending',

  -- Populated only on verification, straight from message.contact.phone_number.
  phone TEXT,
  telegram_id INTEGER,

  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified_at INTEGER,
  consumed_at INTEGER
);

-- Supports the opportunistic purge of expired rows on each issue.
CREATE INDEX IF NOT EXISTS idx_signup_verification_expires
  ON signup_verification (expires_at);

-- One Telegram account should not be able to farm businesses. Not a UNIQUE constraint,
-- because a legitimate owner may retry after an expiry, but it makes the rate-limit
-- lookup by telegram_id cheap.
CREATE INDEX IF NOT EXISTS idx_signup_verification_telegram
  ON signup_verification (telegram_id, created_at);
