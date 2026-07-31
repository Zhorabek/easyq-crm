-- One booking, several services.
--
-- A `bookings` row carries service_id, service_name, price_snapshot and duration_snapshot —
-- exactly one of each. The booking page now lets a customer tick "haircut" and "beard trim"
-- together, which is what every competitor does and what a barbershop actually sells.
--
-- ## Why a join table and not more columns
--
-- Two services could have been service_id_2, price_2… That falls over at three, and every
-- query would grow a branch per slot. A line table is the shape the data already is: a booking
-- has many lines, each with its own price and duration at the time of sale.
--
-- ## Why the old columns stay
--
-- `bookings.service_id`, `service_name`, `price_snapshot` and `duration_snapshot` are NOT
-- dropped, and are still written with the FIRST service plus the TOTAL price and duration.
--
-- That is not laziness. `easyqueue-business-bot` and `easyqueue-client-bot` read those columns
-- by name, and their repos deploy separately — dropping the columns would break both bots the
-- moment this migration ran, before their code could possibly catch up. Keeping them means a
-- bot shows the first service and the right total, which is wrong in detail but never broken,
-- and the CRM and booking page read the lines for the full picture.
--
-- Backfilled from the existing rows below, so every historical booking has exactly one line
-- and nothing has to special-case "old bookings have no lines".
--
-- ## Snapshots, not joins
--
-- price and duration are copied per line rather than read from `services`, for the same reason
-- the booking already snapshots them: a price rise must not silently rewrite what somebody was
-- charged last month. service_name likewise, so a renamed or deleted service still reads
-- correctly in history.

CREATE TABLE IF NOT EXISTS booking_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  -- Nullable: a service deleted from the catalogue must not take the history with it.
  service_id INTEGER,
  service_name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  -- Order the customer chose them in, so a receipt reads the way the basket looked.
  position INTEGER NOT NULL DEFAULT 0
);

-- Every read is "the lines for this booking", so this is the index that matters.
CREATE INDEX IF NOT EXISTS idx_booking_services_booking
  ON booking_services (booking_id, position);

-- Backfill: one line per existing booking, from the columns it already has. Guarded by NOT
-- EXISTS so re-running cannot double every historical booking's price.
INSERT INTO booking_services (booking_id, service_id, service_name, price, duration, position)
SELECT
  b.id,
  b.service_id,
  COALESCE(b.service_name, ''),
  COALESCE(b.price_snapshot, 0),
  COALESCE(b.duration_snapshot, 0),
  0
FROM bookings b
WHERE NOT EXISTS (SELECT 1 FROM booking_services bs WHERE bs.booking_id = b.id);
