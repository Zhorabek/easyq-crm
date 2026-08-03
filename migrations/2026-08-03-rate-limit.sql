-- Request counters, for the rate limiter in src/server/rateLimit.ts.
--
-- Until this existed there was NO rate limiting anywhere in the Worker except a cap of three
-- bookings per phone per day. In particular /api/auth/login accepted unlimited password
-- attempts, and each one costs the Worker 100k PBKDF2 iterations — so it was both a brute-force
-- surface and a way for a stranger to burn the account's CPU budget.
--
-- Fixed windows rather than a sliding log: one row per bucket per window, incremented in place.
-- A sliding window means storing every hit and counting them, which is a row per request and a
-- scan per check. The cost of a fixed window is that someone can spend a full allowance at the
-- end of one window and again at the start of the next; for "stop a script hammering login"
-- that is a trade worth taking, and the burst it permits is still bounded.

CREATE TABLE IF NOT EXISTS rate_limit (
  -- "<action>:<identifier>", e.g. "login:ip:1.2.3.4" or "login:user:barber777".
  bucket TEXT NOT NULL,

  -- Unix seconds, floored to the window size. Part of the key, so a new window is a new row
  -- and expiry needs no clock of its own — the old row simply stops being addressed.
  window_start INTEGER NOT NULL,

  hits INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (bucket, window_start)
);

-- Supports the opportunistic purge of windows that have passed. Without it that DELETE is a
-- full scan on a table written to by every login attempt.
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit (window_start);
