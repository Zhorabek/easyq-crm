-- Cleanup of the 2026-08-04 E2E run-through in barber777.
-- Run in the Cloudflare dashboard → D1 → easyqueue_db → Console (wrangler is broken here).
--
-- STAGE 1 is read-only. Run it, paste the output back, and the deletes in STAGE 2 get
-- filled in with real ids. Do not run STAGE 2 blind: two of the targets (a confirmed
-- booking and a 1 so'm payment) cannot be told apart from real data by name alone.

-- ===========================================================================
-- STAGE 1 — review. Nothing is written.
-- ===========================================================================

-- 1a. Every booking in the shop. The test rows are 5 Aug 10:00 (Mijoz Sinov, pending)
--     and 4 Aug 17:30 (confirmed). Anything else is the shop's own.
SELECT b.id, b.datetime, b.status, b.client_name, b.client_phone,
       b.service_name, b.staff_name, b.price_snapshot, b.user_id
FROM bookings b
WHERE b.business_id = (SELECT id FROM businesses WHERE slug = 'barber777')
ORDER BY b.datetime DESC;

-- 1b. Every payment, with the booking it belongs to. Looking for a single 1 so'm row.
SELECT p.id, p.created_at, p.amount, p.flow, p.method, p.note,
       p.booking_id, b.client_name, b.datetime AS booking_datetime
FROM payments p
LEFT JOIN bookings b ON b.id = p.booking_id
WHERE p.business_id = (SELECT id FROM businesses WHERE slug = 'barber777')
ORDER BY p.created_at DESC;

-- 1c. The orphaned user row. `users` is shared with both Telegram bots and bookings
--     point at it, so this must come back with zero bookings before it is deleted.
SELECT (SELECT COUNT(*) FROM users WHERE id = 1604)              AS user_row_exists,
       (SELECT telegram_id FROM users WHERE id = 1604)           AS telegram_id,
       (SELECT COUNT(*) FROM bookings WHERE user_id = 1604)      AS bookings_referencing;

-- 1d. The one landing_feedback row of unknown provenance. If source = 'booking' it is a
--     real customer and the first genuine feedback the platform has had — keep it, and
--     deal with it in the moderation bot instead.
SELECT id, name, rating, substr(text, 1, 60) AS text, source, approved, created_at
FROM landing_feedback
ORDER BY id;


-- ===========================================================================
-- STAGE 2 — the writes. Run after stage 1 has been read.
-- ===========================================================================

-- 2a. The description. It was NULL before the run-through; it currently reads
--     "Eng yaxshi soch olish, Toshkent markazida", which is E2E text that is live on the
--     public booking page right now. This one is safe to run as-is.
UPDATE businesses
SET description = NULL
WHERE slug = 'barber777'
  AND description = 'Eng yaxshi soch olish, Toshkent markazida';

-- 2b. The Mijoz Sinov booking (5 Aug 10:00, pending). Created by the E2E run through the
--     public booking page, so the name and phone are both mine — safe to match on.
--     Children first: booking_services has no cascade, and payments reference booking_id.
DELETE FROM booking_services
WHERE booking_id IN (
  SELECT id FROM bookings
  WHERE business_id = (SELECT id FROM businesses WHERE slug = 'barber777')
    AND client_name = 'Mijoz Sinov'
);

DELETE FROM payments
WHERE booking_id IN (
  SELECT id FROM bookings
  WHERE business_id = (SELECT id FROM businesses WHERE slug = 'barber777')
    AND client_name = 'Mijoz Sinov'
);

DELETE FROM bookings
WHERE business_id = (SELECT id FROM businesses WHERE slug = 'barber777')
  AND client_name = 'Mijoz Sinov';

-- 2c. The confirmed 4 Aug 17:30 booking and the 1 so'm payment. Ids come from stage 1 —
--     replace the placeholders. Left unscoped deliberately: guessing here risks deleting
--     a real booking, and a wrong DELETE is not undoable in D1.
-- DELETE FROM booking_services WHERE booking_id IN (<booking ids from 1a>);
-- DELETE FROM payments        WHERE id IN (<payment ids from 1b>);
-- DELETE FROM bookings        WHERE id IN (<booking ids from 1a>)
--   AND business_id = (SELECT id FROM businesses WHERE slug = 'barber777');

-- 2d. The orphaned user row, only if 1c returned bookings_referencing = 0.
-- DELETE FROM users WHERE id = 1604;


-- ===========================================================================
-- STAGE 3 — confirm. Should return the shop's real rows only, and a NULL description.
-- ===========================================================================
SELECT (SELECT description FROM businesses WHERE slug = 'barber777') AS description_now,
       (SELECT COUNT(*) FROM bookings
        WHERE business_id = (SELECT id FROM businesses WHERE slug = 'barber777')) AS bookings_left,
       (SELECT COUNT(*) FROM booking_services bs
        LEFT JOIN bookings b ON b.id = bs.booking_id
        WHERE b.id IS NULL) AS orphaned_service_lines;
