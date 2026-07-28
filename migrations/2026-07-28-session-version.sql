-- Session invalidation on password change.
--
-- Sessions are stateless: a signed cookie carrying businessId, role, staffId and an expiry.
-- Nothing in it referenced the password, so changing a password left every OTHER session
-- that person had open working for up to the full 14-day TTL. Someone who reset a leaked
-- password had not actually evicted whoever leaked it.
--
-- session_version is the fix. It goes into the cookie at sign-in and is compared against
-- the row on every authenticated request; bumping the row invalidates every cookie minted
-- before the bump, including on other devices.
--
-- DEFAULT 0 matters for compatibility. Cookies issued before this migration carry no
-- version, and readSession reads a missing one as 0 — which matches the column default, so
-- existing sessions keep working instead of everyone being logged out on deploy.
--
-- Both tables need it because both hold credentials: businesses for the owner login, staff
-- for manager and specialist logins.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS. A duplicate-column error means it
-- is already applied and is safe to ignore.

ALTER TABLE businesses ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
