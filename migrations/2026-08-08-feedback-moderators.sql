-- More than one person may moderate feedback, and the queue may live in a group.
--
-- ## The distinction this migration exists to make
--
-- FEEDBACK_CHAT_ID did two unrelated jobs: it was WHERE notifications were sent and it was WHO was
-- allowed to act on them. That works only while those are the same single person. The moment the
-- queue moves into a group they come apart completely — the destination becomes a group id, and
-- every member of that group can see the buttons, but "can see" must not mean "may publish".
--
-- So they are separated:
--
--   feedback_moderators   WHO may act. Checked against `from.id` on every update, which is the
--                         user who actually pressed the button — identical logic in a private
--                         chat and in a group of forty.
--   feedback_settings     WHERE notifications go. One row, key 'notify_chat_id'. A user id or a
--                         negative group id; the bot does not care which.
--
-- FEEDBACK_CHAT_ID stays, as the ROOT moderator: it is the bootstrap. Without one always-allowed
-- id there is no way to add the first row to an empty moderators table, and an empty table would
-- lock everybody out of a queue that nobody can then unlock. It is deliberately not stored here —
-- it lives in wrangler.toml, so it cannot be deleted by a bad `/remove`.
--
-- ## Why a table rather than a comma-separated variable
--
-- Both work for holding ids. Only one lets the operator add somebody from their phone at the
-- moment they are asked, which is when it actually happens. A variable means opening the
-- Cloudflare dashboard, editing config, and redeploying — and this project has already lost a
-- whole day to a variable name typed into that dashboard with a trailing space.

CREATE TABLE IF NOT EXISTS feedback_moderators (
  telegram_id INTEGER PRIMARY KEY,
  -- Whatever Telegram reported when they were added: a name or @username, purely so `/who` reads
  -- as a list of people rather than a list of numbers.
  label TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Who added them. Not enforced as a foreign key: the root moderator is in wrangler.toml, not in
  -- this table, so a reference would be unresolvable for the first row ever added.
  added_by INTEGER
);

CREATE TABLE IF NOT EXISTS feedback_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
