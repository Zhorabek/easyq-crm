-- Tables and columns the CRM Worker queries but which no migration IN THIS REPO
-- creates. They already exist in the shared production D1 — the CRM is live and these
-- code paths work — but they were added from easyqueue-business-bot/migrations, so a
-- fresh `npm run db:init:local` produces a database this Worker cannot run against.
--
-- READ BEFORE APPLYING TO PRODUCTION. This is reconstructed from the queries in
-- src/worker.ts and src/server/captcha.ts, not copied from the migration that actually
-- created them. Column types and defaults should match, but the bot repo remains the
-- source of truth. It is intended for local development.
--
-- The CREATE statements are idempotent. The ALTER is NOT — SQLite has no
-- "ADD COLUMN IF NOT EXISTS", so it errors if `slug` is already present. That error is
-- safe to ignore; it means the column is there.

-- Anti-replay for the signup captcha (src/server/captcha.ts).
-- The PRIMARY KEY is load-bearing: verifyCaptcha() detects a reused nonce by catching
-- the constraint violation on INSERT, so dropping it would silently allow replay.
CREATE TABLE IF NOT EXISTS captcha_used (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Moderated testimonials submitted from the landing page. `approved` defaults to 0;
-- GET /api/feedback only ever returns approved = 1.
CREATE TABLE IF NOT EXISTS landing_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  rating INTEGER,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-tenant subdomain: `<slug>.easyq.uz` resolves to this business.
ALTER TABLE businesses ADD COLUMN slug TEXT;

-- Partial index, because every business created before subdomains has slug IS NULL and
-- SQLite treats NULLs as distinct under UNIQUE anyway — being explicit documents the
-- intent. This is what makes the INSERT in signupBusiness() an atomic slug claim.
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug
  ON businesses (slug) WHERE slug IS NOT NULL;
