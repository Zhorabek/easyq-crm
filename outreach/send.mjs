// Sends message.ru.txt from the EasyQ account to everyone in recipients.txt.
//
//   node send.mjs --dry-run      resolve every username, send nothing
//   node send.mjs                send for real
//   node send.mjs --limit 15     stop after 15 successful sends
//   node send.mjs --min 60 --max 180    override the gap between messages, in seconds
//
// ## It is resumable, and it will not send twice
//
// Every attempt is appended to sent.jsonl. On startup that ledger is read back and anyone
// already delivered to is skipped, so re-running after a crash, a FLOOD_WAIT or a closed laptop
// picks up where it stopped instead of messaging the first forty people again.
//
// ## Why it is slow on purpose
//
// Telegram limits how fast an account may open new conversations. Going too fast earns a
// FLOOD_WAIT (handled below — it waits and retries) and, past that, a PEER_FLOOD, which
// restricts the account from writing to non-contacts for days. The default gap is 45–120
// seconds, randomised, because a fixed interval is itself a pattern. At that pace ~30 messages
// takes roughly an hour; that is the intended trade.
//
// PEER_FLOOD stops the whole run immediately rather than continuing to burn the account.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { argv } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const HERE = (name) => new URL(`./${name}`, import.meta.url);

/* ------------------------------------------------------------------ arguments */

function flag(name) {
  return argv.includes(`--${name}`);
}
function value(name, fallback) {
  const index = argv.indexOf(`--${name}`);
  if (index === -1 || index === argv.length - 1) return fallback;
  const parsed = Number(argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DRY_RUN = flag("dry-run");
const MAX_SENDS = value("limit", Infinity);
const MIN_GAP_SECONDS = value("min", 45);
const MAX_GAP_SECONDS = value("max", 120);

if (MIN_GAP_SECONDS > MAX_GAP_SECONDS) {
  console.error("--min cannot be larger than --max");
  process.exit(1);
}

/* ---------------------------------------------------------------------- input */

function requireFile(name, hint) {
  if (!existsSync(HERE(name))) {
    console.error(`Missing outreach/${name} — ${hint}`);
    process.exit(1);
  }
  return readFileSync(HERE(name), "utf8");
}

const sessionString = requireFile("session.txt", "run `npm run login` first.").trim();
const message = requireFile("message.ru.txt", "this is the text that gets sent.").trimEnd();

/**
 * One username per line. `@` optional, blank lines and `#` comments ignored.
 *
 * Normalised to lowercase without the `@` so the same person written three ways is still one
 * person as far as the already-sent ledger is concerned.
 */
const recipients = [
  ...new Set(
    requireFile("recipients.txt", "one Telegram username per line.")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "").toLowerCase())
  ),
];

if (recipients.length === 0) {
  console.error("recipients.txt has no usernames in it.");
  process.exit(1);
}

/* --------------------------------------------------------------------- ledger */

const LEDGER = HERE("sent.jsonl");

/** Usernames already DELIVERED to. Failures are not included, so they are retried. */
function alreadySent() {
  if (!existsSync(LEDGER)) return new Set();
  const done = new Set();
  for (const line of readFileSync(LEDGER, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.status === "sent") done.add(String(row.username).toLowerCase());
    } catch {
      // A half-written final line after a hard kill. Ignoring it is right: the worst case is
      // one duplicate message, and refusing to start would be worse.
    }
  }
  return done;
}

function record(username, status, detail) {
  appendFileSync(
    LEDGER,
    `${JSON.stringify({ username, status, detail: detail ?? null, at: new Date().toISOString() })}\n`,
    "utf8"
  );
}

/* ---------------------------------------------------------------------- helpers */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Randomised, so the send pattern is not a metronome. */
function gapMs() {
  const span = MAX_GAP_SECONDS - MIN_GAP_SECONDS;
  return Math.round((MIN_GAP_SECONDS + Math.random() * span) * 1000);
}

function errorCode(error) {
  return String(error?.errorMessage ?? error?.message ?? error ?? "").toUpperCase();
}

/* ------------------------------------------------------------------------ run */

const done = alreadySent();
const queue = recipients.filter((username) => !done.has(username));

console.log(`
recipients.txt : ${recipients.length} unique
already sent   : ${done.size} (skipped)
to send now    : ${Math.min(queue.length, MAX_SENDS === Infinity ? queue.length : MAX_SENDS)}
mode           : ${DRY_RUN ? "DRY RUN — nothing will be sent" : "LIVE"}
gap            : ${MIN_GAP_SECONDS}-${MAX_GAP_SECONDS}s between messages
`);

if (queue.length === 0) {
  console.log("Nothing left to do.");
  process.exit(0);
}

// api_id/api_hash are only needed to open the connection; the session is what authenticates.
// Read from the environment so they are not a second file to keep out of git.
const apiId = Number(process.env.TG_API_ID ?? 0);
const apiHash = process.env.TG_API_HASH ?? "";
if (!apiId || !apiHash) {
  console.error(`
Set TG_API_ID and TG_API_HASH first — the same values used at login.

  PowerShell:  $env:TG_API_ID="123456"; $env:TG_API_HASH="abc..."
  bash:        export TG_API_ID=123456 TG_API_HASH=abc...
`);
  process.exit(1);
}

const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
  connectionRetries: 5,
});
await client.connect();

const me = await client.getMe();
console.log(`Sending as @${me.username ?? me.id}\n`);

let sent = 0;
let failed = 0;
let index = 0;

for (const username of queue) {
  index += 1;
  if (sent >= MAX_SENDS) {
    console.log(`\nReached --limit ${MAX_SENDS}. Stopping.`);
    break;
  }

  const label = `[${index}/${queue.length}] @${username}`;

  // Resolving is a separate step from sending so a bad username is reported as exactly that,
  // rather than as a mysterious send failure.
  let entity;
  try {
    entity = await client.getEntity(username);
  } catch (error) {
    const code = errorCode(error);
    const reason = code.includes("USERNAME_NOT_OCCUPIED")
      ? "no such username"
      : code.includes("USERNAME_INVALID")
        ? "not a valid username"
        : code;
    console.log(`${label} — skipped: ${reason}`);
    record(username, "unresolved", reason);
    failed += 1;
    continue;
  }

  if (DRY_RUN) {
    const name = [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.title || "";
    console.log(`${label} — resolves to ${name || "(no name)"} — would send`);
    sent += 1;
    continue;
  }

  try {
    await client.sendMessage(entity, { message });
    console.log(`${label} — sent`);
    record(username, "sent");
    sent += 1;
  } catch (error) {
    const code = errorCode(error);

    // Telegram asking us to slow down. It says by how much, so wait exactly that and retry the
    // SAME person once — this is a pause, not a rejection.
    if (code.includes("FLOOD_WAIT")) {
      const seconds = Number(error?.seconds ?? 0) || 60;
      console.log(`${label} — FLOOD_WAIT, sleeping ${seconds}s then retrying this one`);
      await sleep((seconds + 5) * 1000);
      try {
        await client.sendMessage(entity, { message });
        console.log(`${label} — sent (after wait)`);
        record(username, "sent");
        sent += 1;
      } catch (retryError) {
        const retryCode = errorCode(retryError);
        console.log(`${label} — failed after wait: ${retryCode}`);
        record(username, "failed", retryCode);
        failed += 1;
      }
      continue;
    }

    // The one that matters. The account has been restricted from writing to people who are not
    // contacts. Continuing would deepen it and send nothing, so stop the run here.
    if (code.includes("PEER_FLOOD")) {
      console.error(`
${label} — PEER_FLOOD.

Telegram has restricted this account from messaging non-contacts. Nothing further will send.
Stop for now; it lifts on its own, typically in a few days. Everyone already delivered to is
recorded in sent.jsonl, so re-running later resumes rather than starting over.
`);
      record(username, "peer_flood");
      break;
    }

    const reason = code.includes("USER_PRIVACY_RESTRICTED")
      ? "their privacy settings do not allow messages from strangers"
      : code.includes("USER_IS_BLOCKED") || code.includes("USER_BLOCKED")
        ? "this account is blocked by them"
        : code.includes("USER_IS_BOT")
          ? "that username is a bot"
          : code;
    console.log(`${label} — failed: ${reason}`);
    record(username, "failed", reason);
    failed += 1;
  }

  // Only pause when there is another one coming.
  const more = index < queue.length && sent < MAX_SENDS;
  if (more && !DRY_RUN) {
    const wait = gapMs();
    console.log(`    …waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

console.log(`
${DRY_RUN ? "Would have sent" : "Sent"}: ${sent}
Failed/skipped : ${failed}
Ledger         : outreach/sent.jsonl
`);

await client.disconnect();
process.exit(0);
