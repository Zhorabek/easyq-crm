-- Feedback that knows where it came from, and businesses that remember being asked.
--
-- ## Why landing_feedback needs a source
--
-- The table was built for one writer: an anonymous form on the marketing site, where all you get
-- is a typed name. Feedback submitted from INSIDE the CRM is a different thing entirely — it comes
-- from a known business, on a known plan, that has been using the product for a known number of
-- days. That context is most of the value: "4 stars" from a shop with 300 bookings and "4 stars"
-- from one that signed up yesterday are not the same signal, and the moderator deciding whether to
-- publish needs to be able to tell them apart.
--
-- `source` rather than "business_id IS NULL means landing": a null business id is also what you get
-- from a bug, and the difference between "anonymous by design" and "we lost the attribution" is
-- worth being able to see.
--
-- ## Why the prompt state lives on businesses
--
-- Asking somebody to rate the product is a thing done TO an account, so the account has to remember
-- it. Two columns rather than one flag, because "answered" and "not now" are different promises:
--
--   feedback_given_at    they rated it. Never ask again.
--   feedback_snoozed_at  they dismissed it. Ask again well after this date.
--
-- One boolean would have collapsed those, and the failure mode is asking somebody who already gave
-- you five stars whether they would like to give you five stars.
--
-- Both nullable with no default, so every existing row reads as "never asked, never answered" and
-- becomes eligible on the normal schedule. Additive throughout: an older deploy ignores columns it
-- does not know about, so this is safe to apply before the Workers ship.

ALTER TABLE landing_feedback ADD COLUMN business_id INTEGER;
ALTER TABLE landing_feedback ADD COLUMN source TEXT NOT NULL DEFAULT 'landing';

ALTER TABLE businesses ADD COLUMN feedback_given_at TEXT;
ALTER TABLE businesses ADD COLUMN feedback_snoozed_at TEXT;

-- The moderation queue is read by "what is waiting", never by id.
CREATE INDEX IF NOT EXISTS idx_landing_feedback_pending ON landing_feedback (approved, created_at);
