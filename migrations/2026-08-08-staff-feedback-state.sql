-- Ask the people who use the CRM most, not only the person who pays for it.
--
-- The rating card was owner-only, because the opinion is filed against a business and a specialist
-- should not speak for the shop. That reasoning was right about attribution and wrong about who to
-- ask: managers and masters are in the calendar all day, every day, and their experience of the
-- product is a genuinely different one — heavy on the schedule, no money, own bookings only. The
-- heaviest users were the only ones never asked.
--
-- The attribution problem is solved by saying whose opinion it is ("a specialist at barber777"),
-- not by refusing to collect it.
--
-- ## Why the state cannot stay on businesses alone
--
-- `businesses.feedback_given_at` answers "has this SHOP answered", and once more than one person
-- per shop can answer, that is the wrong question. The first master to reply would silence the
-- owner and every colleague. So staff carry their own pair and the owner keeps the ones on
-- businesses — the owner has no staff row to hang them on.
--
--   feedback_given_at    answered. Never ask this person again.
--   feedback_snoozed_at  "not now". Ask again well after this date.
--
-- Both nullable with no default, so every existing staff row reads as "never asked, never
-- answered" and becomes eligible on the normal schedule. Additive: an older deploy ignores columns
-- it does not know about, so this is safe to apply before or after the Workers ship.

ALTER TABLE staff ADD COLUMN feedback_given_at TEXT;
ALTER TABLE staff ADD COLUMN feedback_snoozed_at TEXT;
