// The EasyQ outreach account, running as a userbot.
//
//   node bot.mjs
//
// Stays connected and does three things:
//
//   1. watches SAVED MESSAGES for commands — /send, /report, /status, /stop, /help
//   2. sends the intro, paced, on /send
//   3. answers incoming replies it is confident about, and flags the rest for a person
//
// ## Why Saved Messages
//
// It is a chat only the account owner can write to, it syncs to every device, and it survives
// this process dying. So the list of who to contact and the record of what happened live where
// you already are, instead of in a file you have to be at a laptop to read.
//
// ## The rule that keeps the account alive
//
// It only ever writes to people YOU put on a list. It never answers a stranger, never answers
// a group, never answers a bot, and never answers the same person more than a few times. An
// account that replies to anything that messages it is an account that gets reported.

import { readFileSync, existsSync } from "node:fs";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";

import { HELP, INTRO } from "./lib/messages.mjs";
import { extractUsernames, parseCommand } from "./lib/parse.mjs";
import { classify } from "./lib/replies.mjs";
import { FOLDERS, moveToFolder } from "./lib/folders.mjs";
import * as store from "./lib/state.mjs";

/* --------------------------------------------------------------------- tuning */

const GAP_MIN_SECONDS = 45;
const GAP_MAX_SECONDS = 120;

/** Most auto-replies one person can ever pull out of the account. */
const MAX_AUTO_REPLIES_PER_CONTACT = 4;

/** Seconds before the same person can trigger another auto-reply. Stops a loop with a bot. */
const AUTO_REPLY_COOLDOWN_SECONDS = 20;

/** Ceiling on auto-replies across everyone, per hour. A runaway is capped even if a rule is wrong. */
const MAX_AUTO_REPLIES_PER_HOUR = 30;

/* --------------------------------------------------------------------- startup */

const HERE = (name) => new URL(`./${name}`, import.meta.url);

if (!existsSync(HERE("session.txt"))) {
  console.error("Missing outreach/session.txt — run `npm run login` first.");
  process.exit(1);
}
const sessionString = readFileSync(HERE("session.txt"), "utf8").trim();

/**
 * api_id / api_hash, from .env or the environment.
 *
 * `npm run login` writes .env, so a new shell needs no setup. An environment variable still
 * wins, for anyone who would rather not have the file at all.
 */
function credentials() {
  let fromFile = {};
  if (existsSync(HERE(".env"))) {
    const text = readFileSync(HERE(".env"), "utf8");
    fromFile = {
      TG_API_ID: text.match(/^TG_API_ID=(.*)$/m)?.[1]?.trim(),
      TG_API_HASH: text.match(/^TG_API_HASH=(.*)$/m)?.[1]?.trim(),
    };
  }
  return {
    apiId: Number(process.env.TG_API_ID ?? fromFile.TG_API_ID ?? 0),
    apiHash: process.env.TG_API_HASH ?? fromFile.TG_API_HASH ?? "",
  };
}

const { apiId, apiHash } = credentials();
if (!apiId || !apiHash) {
  console.error(`
No api_id / api_hash found — expected outreach/.env (written by \`npm run login\`) or the
environment.

  PowerShell:  $env:TG_API_ID="123456"; $env:TG_API_HASH="abc..."
`);
  process.exit(1);
}

/** `--check` connects, proves the account and folders work, sends nothing, and exits. */
const CHECK_ONLY = process.argv.includes("--check");

const state = store.load();

// A truncated or hand-edited session.txt throws "Not a valid string" from deep inside the
// library, as a bare stack trace that says nothing about what to do. Catch it here and say it.
let session;
try {
  session = new StringSession(sessionString);
} catch {
  console.error(`
outreach/session.txt does not contain a valid session string.

Most likely it was truncated or edited. Delete it and run \`npm run login\` again — the account
is unaffected, this only re-issues the local login.
`);
  process.exit(1);
}

const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });

await client.connect();

if (!(await client.checkAuthorization())) {
  console.error(`
The session in outreach/session.txt is no longer authorised.

That happens if it was terminated from Telegram → Settings → Devices. Delete session.txt and
run \`npm run login\` again.
`);
  process.exit(1);
}

const me = await client.getMe();
const myId = String(me.id);

/**
 * Two calls, without which NO EVENT EVER FIRES.
 *
 * This cost an afternoon, so it is worth writing down. With neither of these the client
 * connects, authorises, sends messages and reports itself perfectly healthy — and simply never
 * receives a single message event. Nothing errors. `/send` typed into Saved Messages just
 * vanishes.
 *
 *  1. `updates.getState` — in MTProto a client does not receive pushed updates until it has
 *     asked for the current update state. Telegram is not withholding them; it was never told
 *     anyone was listening. `connect()` alone does not do this.
 *
 *  2. `getDialogs` — GramJS resolves the chat and sender for every NewMessage before handing
 *     it to a handler, and when the entity is not in the session cache it drops the event
 *     rather than raising anything. One call fills the cache.
 *
 * Measured: without them, 0-1 raw updates and 0 NewMessage in 45 seconds. With them, message
 * events arrive immediately.
 */
await client.invoke(new Api.updates.GetState());
await client.getDialogs({ limit: 100 });

const myName = [me.firstName, me.lastName].filter(Boolean).join(" ");
console.log(`EasyQ outreach — signed in as ${myName || "(no name)"} @${me.username ?? "—"} (id ${myId})`);
console.log(`Contacts on file: ${store.all(state).length}`);

/**
 * `--check`: prove the parts that cannot be tested without an account, then quit.
 *
 * Everything here is safe to run at any time. It writes ONLY to Saved Messages — a chat with
 * yourself — and creates the folders. Nothing reaches another person.
 */
if (CHECK_ONLY) {
  console.log("\nRunning checks. Nothing will be sent to anybody.\n");
  let ok = true;

  try {
    await client.sendMessage("me", {
      message: "EasyQ outreach — connection check. Safe to delete.",
    });
    console.log("  ✔ can write to Saved Messages (where commands and reports live)");
  } catch (error) {
    ok = false;
    console.log(`  ✘ CANNOT write to Saved Messages: ${error?.message ?? error}`);
  }

  // The folder API is the likeliest thing to break: its shape has changed between Telegram
  // layers and free accounts have a folder limit. Better to find out here than mid-send.
  if (await moveToFolder(client, me, "waiting")) {
    // Named from FOLDERS, not repeated here: the titles had to shrink under Telegram's 12-char
    // cap, and a hardcoded copy would have sent you looking for a folder that does not exist.
    console.log(`  ✔ chat folders work — created/updated "${FOLDERS.waiting}"`);
    console.log("      (this account was added to it as the test; remove it in Telegram)");
  } else {
    console.log("  ⚠ chat folders did NOT work — reason above.");
    console.log("      Not fatal: state.json is the real record, and /report never uses folders.");
  }

  console.log(`\nChecks ${ok ? "passed" : "FAILED"}. Nothing was sent to anyone.\n`);
  await client.disconnect().catch(() => {});
  process.exit(ok ? 0 : 1);
}

console.log(`Watching Saved Messages. Send /help there for commands.\n`);

/**
 * `--debug` prints every raw update and every message event, unfiltered.
 *
 * Kept in rather than deleted after use: "the account is connected, healthy, and no command
 * ever arrives" is this tool's characteristic failure, it produces no error anywhere, and this
 * is the only thing that tells you whether the update is missing or merely mis-filtered.
 */
if (process.argv.includes("--debug")) {
  client.addEventHandler((update) => {
    console.log(`  RAW  ${update?.className ?? typeof update}`);
  });
  client.addEventHandler((event) => {
    const m = event.message;
    console.log(
      `  MSG  out=${m?.out} chatId=${String(m?.chatId ?? "?")} ` +
        `isPrivate=${m?.isPrivate} savedMsgs=${String(m?.chatId ?? "") === myId} ` +
        `text=${JSON.stringify(String(m?.text ?? "").slice(0, 30))}`
    );
  }, new NewMessage({}));
  console.log("(debug: logging every update)\n");
}

/* --------------------------------------------------------------------- helpers */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gapMs = () =>
  Math.round((GAP_MIN_SECONDS + Math.random() * (GAP_MAX_SECONDS - GAP_MIN_SECONDS)) * 1000);
const errorCode = (error) =>
  String(error?.errorMessage ?? error?.message ?? error ?? "").toUpperCase();

/** Post back into Saved Messages — the report channel. */
async function say(text) {
  try {
    await client.sendMessage("me", { message: text });
  } catch (error) {
    console.log("(could not write to Saved Messages:", error?.message ?? error, ")");
  }
}

let running = false;
let stopRequested = false;
const autoReplyTimestamps = [];

function autoReplyBudgetLeft() {
  const cutoff = Date.now() - 3600_000;
  while (autoReplyTimestamps.length && autoReplyTimestamps[0] < cutoff) autoReplyTimestamps.shift();
  return MAX_AUTO_REPLIES_PER_HOUR - autoReplyTimestamps.length;
}

/* ------------------------------------------------------------------- sending */

async function runSend(usernames, { dryRun }) {
  if (running) {
    await say("A run is already in progress. /stop it first.");
    return;
  }

  const queue = store.pending(state, usernames);
  const skipped = usernames.length - queue.length;

  await say(
    `${dryRun ? "DRY RUN" : "Sending"} — ${queue.length} to go` +
      (skipped ? `, ${skipped} already done and skipped` : "") +
      (dryRun ? "\nNothing will actually be sent." : `\nPaced ${GAP_MIN_SECONDS}-${GAP_MAX_SECONDS}s apart, so this takes a while.`)
  );

  if (queue.length === 0) {
    await say("Nothing left to do.");
    return;
  }

  running = true;
  stopRequested = false;
  let sent = 0;
  let problems = 0;

  for (const [index, username] of queue.entries()) {
    if (stopRequested) {
      await say(`Stopped by request after ${sent}.`);
      break;
    }

    const row = store.get(state, username);
    const label = `[${index + 1}/${queue.length}] @${username}`;

    let entity;
    try {
      entity = await client.getEntity(username);
    } catch (error) {
      const code = errorCode(error);
      row.status = "unresolved";
      row.detail = code.includes("USERNAME_NOT_OCCUPIED") ? "no such username" : code;
      store.save(state);
      console.log(`${label} — ${row.detail}`);
      problems += 1;
      continue;
    }

    // Never write to a group, a channel or another bot. Only real people were ever the target,
    // and a username can quietly become any of those.
    if (!(entity instanceof Api.User) || entity.bot) {
      row.status = "unresolved";
      row.detail = entity?.bot ? "that username is a bot" : "not a person";
      store.save(state);
      console.log(`${label} — ${row.detail}`);
      problems += 1;
      continue;
    }

    row.userId = String(entity.id);
    row.name = [entity.firstName, entity.lastName].filter(Boolean).join(" ") || null;

    if (dryRun) {
      console.log(`${label} — resolves to ${row.name ?? "(no name)"} — would send`);
      store.save(state);
      sent += 1;
      continue;
    }

    try {
      await client.sendMessage(entity, { message: INTRO.ru });
      row.status = "sent";
      row.detail = null;
      row.sentAt = new Date().toISOString();
      store.save(state);
      console.log(`${label} — sent`);
      sent += 1;
      await moveToFolder(client, entity, "waiting").then((ok) => {
        if (ok) row.folder = "waiting";
      });
    } catch (error) {
      const code = errorCode(error);

      if (code.includes("FLOOD_WAIT")) {
        const seconds = Number(error?.seconds ?? 0) || 60;
        console.log(`${label} — FLOOD_WAIT ${seconds}s, waiting then retrying this one`);
        await say(`Telegram asked for a ${seconds}s pause. Waiting, then carrying on.`);
        await sleep((seconds + 5) * 1000);
        try {
          await client.sendMessage(entity, { message: INTRO.ru });
          row.status = "sent";
          row.sentAt = new Date().toISOString();
          store.save(state);
          console.log(`${label} — sent (after wait)`);
          sent += 1;
        } catch (retryError) {
          row.status = "failed";
          row.detail = errorCode(retryError);
          store.save(state);
          problems += 1;
        }
        continue;
      }

      if (code.includes("PEER_FLOOD")) {
        row.status = "failed";
        row.detail = "PEER_FLOOD";
        store.save(state);
        await say(
          `⚠️ PEER_FLOOD after ${sent} messages.\n\n` +
            "Telegram has restricted this account from writing to non-contacts. Stopping — " +
            "carrying on would send nothing and make it worse. It usually lifts in a few days. " +
            "Everyone already done is recorded, so /send later resumes."
        );
        break;
      }

      const blocked =
        code.includes("USER_IS_BLOCKED") ||
        code.includes("USER_PRIVACY_RESTRICTED") ||
        code.includes("PEER_ID_INVALID");
      row.status = blocked ? "blocked" : "failed";
      row.detail = code.includes("USER_PRIVACY_RESTRICTED")
        ? "privacy settings refuse strangers"
        : code.includes("USER_IS_BLOCKED")
          ? "blocked us"
          : code;
      store.save(state);
      console.log(`${label} — ${row.detail}`);
      problems += 1;
      if (blocked) await moveToFolder(client, entity, "blocked").then((ok) => { if (ok) row.folder = "blocked"; });
    }

    const more = index < queue.length - 1 && !stopRequested;
    if (more && !dryRun) await sleep(gapMs());
  }

  running = false;
  store.save(state);
  await say(
    `${dryRun ? "Dry run" : "Run"} finished.\n\n` +
      `${dryRun ? "Would send" : "Sent"}: ${sent}\nProblems: ${problems}\n\n/report for the full picture.`
  );
}

/* ------------------------------------------------------------------ reporting */

function reportText() {
  const s = store.summarise(state);
  const rows = store.all(state);
  const list = (predicate, limit = 12) =>
    rows.filter(predicate).slice(0, limit).map((r) => `@${r.username}`).join(", ") || "—";

  return `EasyQ outreach — status

Contacted   ${s.sent} of ${s.total}
Replied     ${s.replied}
  • "+"          ${s.interested}
  • questions    ${s.asked}
  • declined     ${s.declined}
No reply    ${s.silent}  (48h+ after sending)

Did not go through
  blocked / privacy   ${s.blocked}
  no such username    ${s.unresolved}
  other failures      ${s.failed}
  still queued        ${s.queued}

Waiting on you (${s.needsHuman}):
${list((r) => r.needsHuman)}

Interested:
${list((r) => r.reply === "interested")}

Blocked:
${list((r) => r.status === "blocked")}

Silent after 48h:
${list((r) => r.status === "sent" && r.reply === "none" && r.sentAt && Date.now() - new Date(r.sentAt).getTime() > 48 * 3600_000)}`;
}

/* ------------------------------------------------- Saved Messages command handler */

client.addEventHandler(async (event) => {
  const message = event.message;

  // Saved Messages is identified by CHAT ID ALONE — the chat whose id is my own.
  //
  // The obvious first check, `if (!message.out) return`, is wrong and threw every command away
  // one line in. Telegram reports messages in Saved Messages with **out=false**: you are both
  // the sender and the recipient, and it resolves that as incoming. Measured, not assumed —
  // `--debug` printed `out=false chatId=8789277873 savedMsgs=true text="/help"`.
  //
  // Chat id is sufficient on its own: for a DM from anyone else the chat id is THEIR id, never
  // mine, so nothing but Saved Messages can reach this handler.
  if (!message || String(message.chatId ?? "") !== myId) return;

  const parsed = parseCommand(message.text);
  if (!parsed) return;

  const { command, args } = parsed;

  if (command === "help") return void (await say(HELP));

  if (command === "report") return void (await say(reportText()));

  if (command === "stop") {
    stopRequested = true;
    return void (await say(running ? "Stopping after the current message." : "Nothing is running."));
  }

  if (command === "status") {
    const [name] = extractUsernames(args.join(" "));
    if (!name) return void (await say("Usage: /status @username"));
    const row = state.contacts[name];
    if (!row) return void (await say(`@${name} is not on the list.`));
    return void (await say(
      `@${row.username}\n` +
        `name      ${row.name ?? "—"}\n` +
        `status    ${row.status}${row.detail ? ` (${row.detail})` : ""}\n` +
        `sent      ${row.sentAt ?? "—"}\n` +
        `reply     ${row.reply}\n` +
        `messages  ${row.incomingCount} in, ${row.autoReplies} auto-answered\n` +
        `needs you ${row.needsHuman ? "yes" : "no"}`
    ));
  }

  if (command === "send") {
    const dryRun = args.some((a) => /^(dry|--dry-run|-n)$/i.test(a));

    // The list is whatever message this command is a REPLY to.
    const replyTo = await message.getReplyMessage().catch(() => null);
    if (!replyTo?.text) {
      return void (await say(
        "Reply to a message that contains the usernames, then send /send.\n\n" +
          "Put one per line in a Saved Message first — @name, name, or a t.me link."
      ));
    }

    const usernames = extractUsernames(replyTo.text);
    if (usernames.length === 0) {
      return void (await say("No usernames found in that message."));
    }

    for (const username of usernames) store.get(state, username);
    store.save(state);

    // Deliberately not awaited: the run takes an hour, and the handler must return so further
    // commands (/stop, /report) are still processed while it works.
    void runSend(usernames, { dryRun });
    return;
  }

  await say(`Unknown command /${command}. /help for the list.`);
}, new NewMessage({}));

/* ---------------------------------------------------------- incoming replies */

client.addEventHandler(async (event) => {
  const message = event.message;
  if (!message || message.out) return;
  if (!message.isPrivate) return; // never groups or channels

  // Skipping self is what keeps Saved Messages out of here. Those arrive with out=false (see
  // the command handler above), so they reach this point looking like an ordinary private
  // message — and without this line every command would ALSO be run through the auto-replier.
  const senderId = String(message.senderId ?? "");
  if (!senderId || senderId === myId) return;

  const row = store.byUserId(state, senderId);

  // Somebody we never wrote to. Record nothing, answer nothing — an account that replies to
  // anyone who messages it is an account that will eventually be reported for it.
  if (!row) return;

  const sender = await message.getSender().catch(() => null);
  if (sender?.bot) return;

  row.incomingCount += 1;
  row.lastIncomingAt = new Date().toISOString();

  const verdict = classify(message.text ?? "");

  if (verdict.intent === "interested") {
    row.reply = "interested";
    row.needsHuman = true; // a person still has to actually follow up
  } else if (verdict.intent === "declined") {
    row.reply = "declined";
    row.needsHuman = false;
  } else if (verdict.intent === "faq" || verdict.intent === "language") {
    if (row.reply === "none") row.reply = "question";
  } else if (verdict.intent === "question") {
    row.reply = "question";
    row.needsHuman = true;
  }

  // Move the chat where it belongs, so the folders match the state file.
  if (sender) {
    const folderKey = row.reply === "interested" ? "answered" : row.status === "blocked" ? "blocked" : "waiting";
    await moveToFolder(client, sender, folderKey).then((ok) => { if (ok) row.folder = folderKey; });
  }

  store.save(state);

  // ── the gates on ever saying anything ────────────────────────────────────────
  if (!verdict.send) {
    if (row.needsHuman) await say(`💬 @${row.username} wrote something for you:\n\n${message.text ?? ""}`);
    return;
  }
  if (row.autoReplies >= MAX_AUTO_REPLIES_PER_CONTACT) return;
  if (row.lastAutoReplyAt && Date.now() - new Date(row.lastAutoReplyAt).getTime() < AUTO_REPLY_COOLDOWN_SECONDS * 1000) return;
  // The same FAQ answer twice to the same person reads as a broken machine.
  if (verdict.intent === "faq" && row.faqAnswered.includes(verdict.faqId)) return;
  if (autoReplyBudgetLeft() <= 0) {
    console.log("(hourly auto-reply cap reached — staying quiet)");
    return;
  }

  try {
    await sleep(1500 + Math.random() * 2500); // not instant; instant reads as a machine
    await client.sendMessage(sender ?? senderId, { message: verdict.send });
    row.autoReplies += 1;
    row.lastAutoReplyAt = new Date().toISOString();
    if (verdict.intent === "faq") row.faqAnswered.push(verdict.faqId);
    autoReplyTimestamps.push(Date.now());
    store.save(state);
    console.log(`@${row.username} — auto-answered (${verdict.intent}${verdict.faqId ? `:${verdict.faqId}` : ""})`);
  } catch (error) {
    console.log(`@${row.username} — could not reply: ${errorCode(error)}`);
  }

  if (verdict.intent === "interested") {
    await say(`✅ @${row.username} answered "+" — sent the follow-up. Over to you.`);
  }
}, new NewMessage({ incoming: true }));

process.on("SIGINT", async () => {
  console.log("\nStopping.");
  store.save(state);
  await client.disconnect().catch(() => {});
  process.exit(0);
});
