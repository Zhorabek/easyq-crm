-- Reviews, tied to a booking that actually happened.
--
-- ## This EXTENDS a table that already exists
--
-- `reviews` was already in the shared database, created by easyqueue-business-bot's schema.sql:
--
--   CREATE TABLE reviews (id, business_id NOT NULL, text NOT NULL,
--                         rating NOT NULL CHECK(rating BETWEEN 1 AND 5),
--                         FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE)
--
-- It is empty, but it is NOT unused: easyqueue-business-bot runs
-- `SELECT id, text, rating FROM reviews WHERE business_id = ?` and easyqueue-client-bot builds
-- a per-staff average from it. Both name their columns, so ADDING columns is invisible to them
-- — where dropping and recreating the table would have been a coin flip on two services that
-- deploy from repos of their own.
--
-- That is also why the original CHECK on rating survives: it is a constraint worth having, and
-- rebuilding the table to keep it would defeat the point of not rebuilding the table.
--
-- ## What the new columns buy
--
-- `booking_id` is the anchor, and the UNIQUE INDEX below is what makes it work:
--
--   - only somebody who was actually booked in can review, because the link they follow
--     carries a token tied to their booking (bookings.review_token);
--   - one visit is one review, so an average cannot be inflated by submitting ten;
--   - the review knows which STAFF member it is about without being told, because the booking
--     does — `staff_id` is copied from the booking at insert time, never from the request.
--
-- A business-level review with no booking behind it is precisely what a fake-review farm
-- needs, and shutting that door now is far easier than closing it later.
--
-- `approved` defaults to 0 and nothing renders publicly until an owner flips it, the same rule
-- `landing_feedback` already uses. A one-star review is not a reason to hide it — that is the
-- owner's reputation to manage — but a page publishing unmoderated text from anyone who ever
-- booked is a page that will eventually publish abuse.
--
-- NOTE FOR THE BOTS: neither bot filters on `approved` yet, because until now there was
-- nothing to filter. Their queries need `AND approved = 1` before real reviews start landing,
-- or they will show unmoderated text in Telegram while the web page correctly hides it.
--
-- ## Why UNIQUE arrives as an index
--
-- SQLite's ALTER TABLE ADD COLUMN cannot add a UNIQUE column. A unique INDEX over the new
-- column is exactly equivalent and is the standard way round it.
--
-- `created_at` gets no DEFAULT for a related reason: ADD COLUMN only accepts a constant
-- default, and `datetime('now')` is not one. It is written at insert time instead.
--
-- NOT idempotent: an error naming a duplicate column means that column is already applied and
-- is safe to ignore — but the statements after it still need to run, so execute them one at a
-- time if that happens.

ALTER TABLE reviews ADD COLUMN booking_id INTEGER;
ALTER TABLE reviews ADD COLUMN staff_id INTEGER;
ALTER TABLE reviews ADD COLUMN client_name TEXT;
ALTER TABLE reviews ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN created_at TEXT;

-- One review per visit. The constraint enforces it so the endpoint does not have to.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking ON reviews (booking_id);

-- The booking page's question: "this specialist's average, and how many?"
CREATE INDEX IF NOT EXISTS idx_reviews_staff ON reviews (staff_id, approved);

-- The CRM's question: "what is waiting for me to moderate?"
CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews (business_id, approved, created_at);

-- bookings.review_token and its index are already applied; they were in the first run of this
-- migration and succeeded before the reviews statements aborted.
