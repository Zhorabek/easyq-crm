-- Logos and specialist photos, stored in D1 instead of Telegram.
--
-- ## Why this table exists
--
-- Uploads used to go to Telegram: the CRM called sendPhoto to the business owner's chat, kept
-- the returned file_id, deleted the message, and proxied the image back through getFile. No
-- bucket to configure, which was the appeal. It cannot work:
--
--  1. It needs BUSINESS_BOT_TOKEN, a Worker secret. Unset, every upload returns 503.
--  2. Worse, and unfixable by setting that secret: the chat it sends to is the OWNER's chat,
--     resolved from users.telegram_id. A business that signed up on the WEB has no Telegram
--     account, so signup writes a synthetic NEGATIVE id (users.telegram_id is NOT NULL
--     UNIQUE). getBusinessOwnerTelegramId returns that negative number, sendPhoto is called
--     with a chat that does not exist, and the upload fails. Every web-signed-up business —
--     which is every business that did not come through the bot — could never upload a logo.
--
-- So the bytes live here. D1 is already bound, needs no secret, and a logo is small.
--
-- ## Shape
--
-- `staff_id` is 0 rather than NULL for a business logo, so the unique index below just works:
-- SQLite treats NULLs as distinct in a unique index, which would have let a business
-- accumulate several "current" logos.
--
-- `content_type` is stored because the bytes are served straight back and the response must
-- declare what they are. It is written from server-side sniffing, never from the upload's
-- Content-Type header — see src/shared/imageFile.ts.
--
-- INSERT OR REPLACE against the unique index makes an upload idempotent: replacing a logo
-- overwrites the row rather than growing history nobody reads.
--
-- ## Not touched
--
-- businesses.photo_file_id stays and is still read as a fallback. A business that uploaded
-- through the Telegram bot has a real file_id there, and easyqueue-business-bot uses that
-- column — dropping it would break their existing photo.

CREATE TABLE IF NOT EXISTS crm_images (
  business_id INTEGER NOT NULL,
  -- 0 for the business logo; a staff.id for a specialist photo.
  staff_id INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_id, staff_id)
);

-- Existence lookups run on every CRM payload ("does this business have a logo? which staff
-- have photos?") and must not read the blobs. The primary key above already covers
-- (business_id, staff_id), so that lookup is an index scan with no table access for staff_id.
CREATE INDEX IF NOT EXISTS idx_crm_images_business ON crm_images (business_id);
