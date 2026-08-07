-- Who is using EasyQ, and how much.
--
-- SQLite (Cloudflare D1), not MySQL: no NOW(), no DATE_SUB(), no SHOW TABLES. Dates are TEXT and
-- compared as strings, which works because everything is stored ISO-8601 — `datetime('now','-30 day')`
-- is the idiom throughout.
--
-- Run these in the D1 console: dash.cloudflare.com -> Storage & Databases -> D1 -> easyqueue_db ->
-- Console. ONE STATEMENT AT A TIME — the console aborts a batch on the first error, so a pasted
-- block can silently stop halfway and still look like it ran.
--
-- Two words that mean different things here, and mixing them up makes every number wrong:
--
--   businesses  the shops paying for this. "How many customers do we have" is this table.
--   users       Telegram END-CUSTOMERS who booked through a bot. Thousands of these would be
--               a success; they are not accounts, and they never see the CRM.


-- ── 1. The overview ────────────────────────────────────────────────────────
-- One row, the whole picture. Start here.
SELECT
  (SELECT COUNT(*) FROM businesses)                                              AS shops,
  (SELECT COUNT(*) FROM businesses WHERE crm_password_hash IS NOT NULL)          AS shops_with_crm_login,
  (SELECT COUNT(DISTINCT business_id) FROM bookings
     WHERE created_at >= datetime('now','-30 day'))                              AS shops_active_30d,
  (SELECT COUNT(DISTINCT business_id) FROM bookings
     WHERE created_at >= datetime('now','-7 day'))                               AS shops_active_7d,
  (SELECT COUNT(*) FROM users)                                                   AS telegram_customers,
  (SELECT COUNT(*) FROM bookings)                                                AS bookings_all_time,
  (SELECT COUNT(*) FROM bookings WHERE created_at >= datetime('now','-30 day'))  AS bookings_30d,
  (SELECT COUNT(*) FROM staff)                                                   AS staff,
  (SELECT COUNT(*) FROM services WHERE is_active = 1)                            AS active_services;


-- ── 2. Who is actually using it ────────────────────────────────────────────
-- The leaderboard. `days_since_last` is the column that matters: a shop that has not taken a
-- booking in three weeks has stopped using the product, whatever its total says.
SELECT
  b.id,
  b.name,
  b.slug,
  b.type,
  b.plan,
  DATE(b.created_at)                                            AS signed_up,
  COUNT(bk.id)                                                  AS bookings,
  SUM(CASE WHEN bk.status = 'done' THEN 1 ELSE 0 END)           AS completed,
  SUM(CASE WHEN bk.created_at >= datetime('now','-30 day') THEN 1 ELSE 0 END) AS last_30d,
  MAX(DATE(bk.created_at))                                      AS last_booking,
  CAST(julianday('now') - julianday(MAX(bk.created_at)) AS INT) AS days_since_last
FROM businesses b
LEFT JOIN bookings bk ON bk.business_id = b.id
GROUP BY b.id
ORDER BY last_30d DESC, bookings DESC;


-- ── 3. Signed up but never really started ──────────────────────────────────
-- The churn list. Somebody signed them up, they never got going, and nobody noticed.
SELECT
  b.id, b.name, b.slug, DATE(b.created_at) AS signed_up,
  CAST(julianday('now') - julianday(b.created_at) AS INT) AS days_old,
  (SELECT COUNT(*) FROM bookings WHERE business_id = b.id)   AS bookings,
  (SELECT COUNT(*) FROM staff    WHERE business_id = b.id)   AS staff,
  (SELECT COUNT(*) FROM services WHERE business_id = b.id AND is_active = 1) AS services,
  CASE WHEN b.crm_password_hash IS NULL THEN 'no CRM login' ELSE 'has login' END AS crm
FROM businesses b
WHERE (SELECT COUNT(*) FROM bookings WHERE business_id = b.id) < 5
ORDER BY b.created_at DESC;


-- ── 4. Growth, by week ─────────────────────────────────────────────────────
-- New shops and new bookings side by side. Sign-ups without bookings is the shape to worry about.
SELECT
  STRFTIME('%Y-W%W', created_at) AS week,
  COUNT(*)                       AS new_shops
FROM businesses
GROUP BY week
ORDER BY week DESC
LIMIT 12;

SELECT
  STRFTIME('%Y-W%W', created_at) AS week,
  COUNT(*)                                                    AS bookings,
  COUNT(DISTINCT business_id)                                 AS shops_booking,
  SUM(CASE WHEN status = 'done'      THEN 1 ELSE 0 END)       AS completed,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)       AS cancelled
FROM bookings
GROUP BY week
ORDER BY week DESC
LIMIT 12;


-- ── 5. Where bookings come from ────────────────────────────────────────────
-- The Telegram bots do not populate client_phone; the web booking page and the CRM always do.
-- So this splits the channel without a dedicated column. See "Known limits" in TODO.md.
SELECT
  CASE
    WHEN client_phone IS NOT NULL AND TRIM(client_phone) != '' THEN 'web or CRM'
    WHEN user_id IS NOT NULL                                   THEN 'telegram bot'
    ELSE 'unknown'
  END AS channel,
  COUNT(*)                    AS bookings,
  COUNT(DISTINCT business_id) AS shops
FROM bookings
GROUP BY channel
ORDER BY bookings DESC;


-- ── 6. Subscriptions ───────────────────────────────────────────────────────
-- Who is on what, and who lapses soon. plan_expires_at is EXCLUSIVE: it is the first unpaid day.
SELECT plan, COUNT(*) AS shops, MIN(plan_expires_at) AS soonest_expiry
FROM businesses
GROUP BY plan
ORDER BY shops DESC;

SELECT id, name, slug, plan, plan_expires_at,
       CAST(julianday(plan_expires_at) - julianday('now') AS INT) AS days_left
FROM businesses
WHERE plan_expires_at IS NOT NULL
  AND plan_expires_at <= DATE('now','+14 day')
ORDER BY plan_expires_at;


-- ── 7. Money ───────────────────────────────────────────────────────────────
-- Every figure the shops recorded through the cash desk. `flow` is 'in' or 'out' (refunds).
SELECT
  STRFTIME('%Y-%m', created_at) AS month,
  COUNT(*)                                                  AS payments,
  COUNT(DISTINCT business_id)                               AS shops,
  SUM(CASE WHEN flow = 'in'  THEN amount ELSE 0 END)        AS taken,
  SUM(CASE WHEN flow = 'out' THEN amount ELSE 0 END)        AS refunded
FROM payments
GROUP BY month
ORDER BY month DESC
LIMIT 12;


-- ── 8. End-customers ───────────────────────────────────────────────────────
-- Repeat rate is the honest measure of whether the product is working for the shops: a customer
-- who books twice chose to come back.
-- `repeat_customers`, not `returning`: RETURNING is a reserved word in SQLite and `AS returning`
-- is a syntax error rather than a quoting nuisance.
SELECT
  COUNT(*)                                        AS customers,
  SUM(CASE WHEN visits = 1 THEN 1 ELSE 0 END)     AS one_visit_only,
  SUM(CASE WHEN visits > 1 THEN 1 ELSE 0 END)     AS repeat_customers,
  ROUND(AVG(visits), 2)                           AS avg_visits
FROM (
  SELECT COALESCE(NULLIF(TRIM(client_phone), ''), 'user:' || user_id) AS who,
         COUNT(*) AS visits
  FROM bookings
  WHERE client_phone IS NOT NULL OR user_id IS NOT NULL
  GROUP BY who
);


-- ── 9. Language split ──────────────────────────────────────────────────────
-- What the end-customers picked in the bots. Worth knowing before writing any broadcast.
SELECT COALESCE(language, 'not set') AS language, COUNT(*) AS customers
FROM users
GROUP BY language
ORDER BY customers DESC;
