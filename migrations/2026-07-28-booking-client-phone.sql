-- Contact number for bookings made on the public booking page.
--
-- The bookings table carries client_name but no phone: every booking used to come from
-- a Telegram bot, where the business could always reach the client back through the
-- chat. A web client has no chat, so without this a no-show is unreachable.
--
-- Nullable and additive on purpose. `bookings` is shared with easyqueue-business-bot
-- and easyqueue-client-bot; they SELECT named columns, so a new nullable column is
-- invisible to them and needs no coordinated deploy.
--
-- Stored canonical (+998XXXXXXXXX) per src/shared/phone.ts, so it can be matched
-- against itself later — grouping a client's visit history by number only works if the
-- format is stable.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS. An error here means the
-- column already exists and is safe to ignore.

ALTER TABLE bookings ADD COLUMN client_phone TEXT;
