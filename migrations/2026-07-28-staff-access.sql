-- CRM logins for staff, so a manager can sign in as themselves.
--
-- Until now there was exactly ONE login per business (businesses.crm_username), and the
-- CRM's owner/receptionist/specialist "roles" were a localStorage view-as switcher with
-- no server counterpart — anyone signed in could click themselves back to owner, and
-- every endpoint was reachable regardless. These columns are what make the role real.
--
-- access_role is NOT the existing `role` column. `role` is the free-text job title shown
-- to clients ("Barber"); access_role is the permission level. Conflating them would mean
-- renaming somebody's job title changed what they can do.
--
-- Values: 'manager'   day-to-day running — bookings, payments, schedules, services
--         'specialist' their own calendar only
-- The owner is the business account itself and has no staff row, so 'owner' is
-- deliberately absent here.
--
-- access_enabled exists separately from crm_username because revoking access must not
-- destroy the username — reissuing it later should be one click, and a freed username
-- could otherwise be claimed by somebody else in the meantime.
--
-- crm_temp_password mirrors the signup pattern: stored in the clear ONLY until first
-- change, so the owner can read it out to the person once. hashCrmPassword still governs
-- authentication; the plaintext is never consulted for login.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS. Errors naming a duplicate
-- column mean it is already applied and are safe to ignore.

ALTER TABLE staff ADD COLUMN crm_username TEXT;
ALTER TABLE staff ADD COLUMN crm_password_hash TEXT;
ALTER TABLE staff ADD COLUMN crm_temp_password TEXT;
ALTER TABLE staff ADD COLUMN access_role TEXT;
ALTER TABLE staff ADD COLUMN access_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN access_updated_at TEXT;

-- Usernames live in ONE namespace with businesses.crm_username, because login resolves a
-- bare username with no idea which kind of account it is. A staff name colliding with a
-- business name would make that lookup ambiguous, so uniqueness is enforced here and
-- checked against both tables when granting access.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_crm_username
  ON staff (crm_username) WHERE crm_username IS NOT NULL;
