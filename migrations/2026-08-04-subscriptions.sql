-- Subscriptions: a free month, then a paid tier.
--
-- ## The columns
--
-- `plan`            'trial' until it is paid for, then p2 / p5 / p8 / p15 (see shared/plans.ts).
-- `plan_started_at` when the current period began. Kept for support questions, not read by code.
-- `plan_expires_at` ISO date, EXCLUSIVE: access ends at the start of this day.
--
-- Exclusive because "expires on the 3rd" has to mean something unambiguous. A month bought on
-- the 3rd of August runs through the 2nd of September, and the 3rd is the first unpaid day.
--
-- ## Dates, not timestamps
--
-- A subscription that lapsed at midnight UTC would lapse at five in the morning in Tashkent,
-- which is a strange time to lock somebody out of their own shop. Storing a date and comparing
-- it against the date in the SHOP's timezone means it always turns over overnight, locally.
--
-- ## The backfill is deliberately generous
--
-- Every business that predates this feature gets a month from TODAY rather than from when they
-- signed up. Backfilling from created_at would expire the early partners the instant this
-- migration ran — the people who were promised a free month and have been using the product
-- for weeks. They get their month starting now; nobody is surprised.
--
-- Until this migration runs, plan_expires_at is NULL everywhere and readSubscription treats
-- NULL as active. So deploying the code ahead of the SQL changes nothing for anyone, which is
-- what makes the order safe either way round.

ALTER TABLE businesses ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE businesses ADD COLUMN plan_started_at TEXT;
ALTER TABLE businesses ADD COLUMN plan_expires_at TEXT;

UPDATE businesses
   SET plan_started_at = COALESCE(plan_started_at, date('now')),
       plan_expires_at = COALESCE(plan_expires_at, date('now', '+30 day'))
 WHERE plan_expires_at IS NULL;

-- "Whose trial ends this week" is the only query that scans by date.
CREATE INDEX IF NOT EXISTS idx_businesses_plan_expires ON businesses (plan_expires_at);
