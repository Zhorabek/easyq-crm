-- Real role and phone for staff.
--
-- The staff table held only (id, business_id, name). The CRM showed a "role" anyway, by
-- taking the staff member's first linked service name and falling back to a hardcoded
-- Russian "Специалист" — so a barber who cuts hair was labelled "Стрижка", and the label
-- appeared in Russian regardless of the owner's language.
--
-- Phone matters operationally: an owner rearranging tomorrow's calendar needs to reach
-- the person whose shifts are moving, and until now the CRM held no way to contact them.
--
-- Both nullable and additive. `staff` is shared with easyqueue-business-bot and
-- easyqueue-client-bot, which SELECT named columns, so neither notices.
--
-- Phone is stored canonical (+998XXXXXXXXX) per src/shared/phone.ts.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS. An error naming a duplicate
-- column means it is already applied and is safe to ignore.

ALTER TABLE staff ADD COLUMN role TEXT;
ALTER TABLE staff ADD COLUMN phone TEXT;
