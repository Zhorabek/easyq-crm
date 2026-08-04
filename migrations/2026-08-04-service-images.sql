-- Pictures for services, the same way logos and staff photos already work.
--
-- ## Why a second table rather than a column on crm_images
--
-- `crm_images` is keyed PRIMARY KEY (business_id, staff_id), with staff_id 0 meaning "the
-- business logo". A service id cannot join that key: SQLite cannot alter a primary key, and
-- service 14 and staff 14 both exist, so squeezing services into the same column would have
-- them overwrite each other.
--
-- The alternatives were worse. Rebuilding crm_images means copying every stored image through a
-- temporary table to change one constraint — a migration that can lose a shop's logo if it
-- fails halfway. Storing services as NEGATIVE staff ids works and is exactly the kind of trick
-- that reads fine today and bites whoever greps for it in a year.
--
-- So: same shape, same rules, different owner. The storage code takes the table as an argument
-- rather than being duplicated.
--
-- Bytes are stored BASE64 in a BLOB column for the reason written up in crm-images.sql: D1
-- accepts only ArrayBuffer for a blob bind and hands blobs back as an array of integers, and
-- getting either end wrong stores something that is not an image while every type still checks
-- out. Base64 has one representation in both directions.

CREATE TABLE IF NOT EXISTS crm_service_images (
  business_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_id, service_id)
);

-- "Which services have a picture?" runs on every CRM payload and must not read the blobs. The
-- primary key covers it as an index-only scan.
CREATE INDEX IF NOT EXISTS idx_crm_service_images_business ON crm_service_images (business_id);
