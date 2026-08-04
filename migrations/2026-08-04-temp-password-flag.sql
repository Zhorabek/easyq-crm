-- Stop storing temporary CRM passwords in plaintext.
--
-- `crm_temp_password` held the real, readable password for every business and every staff
-- member who had never chosen their own. It existed so the owner could look it up later — the
-- business bot printed it on demand with a "copy password" button — which is exactly why it
-- could not simply be hashed: you cannot show somebody a hash.
--
-- The fix is to change WHEN it is readable rather than how it is stored. A generated password
-- is shown once, at the moment it is generated, and never again; if it is lost, generating
-- another one is one tap. So all the database needs to remember is the one bit the UI actually
-- uses — "is this account still on a password we generated for it" — which is what drives the
-- "you are using a temporary password" warning and the hint text in the bot.
--
-- Anyone with read access to this database could previously log in as any business or any staff
-- member. That includes a D1 console session, a backup, and every future query someone runs
-- against the wrong table. The password hash beside it was always the real credential; this
-- column was a spare key left under the mat.
--
-- Run this BEFORE deploying the Workers that read the new column: an older deploy ignores a
-- column it does not know about, so this order is safe in both directions.

ALTER TABLE businesses ADD COLUMN crm_temp_password_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN crm_temp_password_pending INTEGER NOT NULL DEFAULT 0;

-- Carry the meaning across before destroying the source: whoever is on a generated password
-- today must keep seeing the warning tomorrow.
UPDATE businesses SET crm_temp_password_pending = 1 WHERE crm_temp_password IS NOT NULL AND TRIM(crm_temp_password) != '';
UPDATE staff SET crm_temp_password_pending = 1 WHERE crm_temp_password IS NOT NULL AND TRIM(crm_temp_password) != '';

-- The point of the exercise. The column stays (dropping it would break any deploy still in
-- flight); it is simply never read or written again.
UPDATE businesses SET crm_temp_password = NULL WHERE crm_temp_password IS NOT NULL;
UPDATE staff SET crm_temp_password = NULL WHERE crm_temp_password IS NOT NULL;
