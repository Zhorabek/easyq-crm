-- Two things an owner controls about their booking page.
--
-- 1. `businesses.booking_flow` — what a customer is asked for, and in what order.
--
--    Until now the booking page always asked for the service first and the specialist
--    second. That is right for a barbershop with a price list and wrong for one where
--    people come back to the same person: those customers know who they want before they
--    know what it is called.
--
--    Three values, checked in src/shared/bookingFlow.ts:
--      'service_first'  service, then specialist  (the existing behaviour, and the default)
--      'staff_first'    specialist, then service
--      'service_only'   service only; the specialist is assigned and never shown
--
--    NULL means 'service_first', so every business that exists today keeps exactly the
--    page it has now without a backfill.
--
-- 2. `staff.photo_file_id` / `photo_file_unique_id` — a photo per specialist.
--
--    Same storage as the business logo: the file is uploaded to the business bot and only
--    Telegram's file_id is kept here, so there is no bucket to configure and no bytes in
--    D1. Mirrors businesses.photo_file_id exactly, including the unique id, which is what
--    lets a caller tell two file_ids for the same photo apart.
--
-- All three columns are nullable and additive. `businesses` and `staff` are shared with
-- easyqueue-business-bot and easyqueue-client-bot, which SELECT named columns, so neither
-- bot notices these exist.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS. An error naming a duplicate
-- column means that column is already applied and is safe to ignore — the remaining
-- statements still need to run, so execute them one at a time if that happens.

ALTER TABLE businesses ADD COLUMN booking_flow TEXT;
ALTER TABLE staff ADD COLUMN photo_file_id TEXT;
ALTER TABLE staff ADD COLUMN photo_file_unique_id TEXT;
