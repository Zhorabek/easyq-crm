// One-time sign-in for the EasyQ project account.
//
// Run this once. Telegram sends a login code to the account, you type it in here, and it writes
// a SESSION STRING to session.txt. Every later run reads that file and never asks again.
//
// Nothing you type is stored except the resulting session string, and nothing leaves your
// machine — this talks to Telegram directly.
//
// The session string IS the login. Anyone holding it is signed in as this account with no code
// and no password. It is gitignored; if it ever escapes, revoke it from
// Telegram → Settings → Devices → terminate the session.

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const SESSION_FILE = new URL("./session.txt", import.meta.url);
const ENV_FILE = new URL("./.env", import.meta.url);

/**
 * One readline interface for everything, with a mutable output stream.
 *
 * The first version of this read `stdin` directly in raw mode to hide the 2FA password, WHILE a
 * readline interface was also attached to stdin. Two consumers of one stream: readline holds
 * it, the raw loop never receives the keystrokes, and the prompt hangs forever — after Telegram
 * has already accepted the login, so it looks like it worked and then silently produced no
 * session file. Muting one shared interface avoids the conflict entirely.
 */
let muted = false;
const maskedOutput = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) stdout.write(chunk, encoding);
    callback();
  },
});

const rl = createInterface({ input: stdin, output: maskedOutput, terminal: true });
const ask = (question) => rl.question(question);

async function askHidden(question) {
  stdout.write(question); // prompt is written before muting, so it is visible
  muted = true;
  try {
    return await rl.question("");
  } finally {
    muted = false;
    stdout.write("\n");
  }
}

/* ------------------------------------------------------------------------ run */

if (existsSync(SESSION_FILE)) {
  const answer = await ask("session.txt already exists. Sign in again and overwrite it? (y/N) ");
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Left it alone.");
    rl.close();
    process.exit(0);
  }
}

console.log(`
Get an API ID and API HASH once from https://my.telegram.org
  -> API development tools -> create an application

Short name must be ALPHANUMERIC — no underscores, or the form fails with a bare "ERROR".
These identify the app, not the account.
`);

// Reuse whatever is already in .env so a retry does not mean retyping them.
let existingId = "";
let existingHash = "";
if (existsSync(ENV_FILE)) {
  const text = readFileSync(ENV_FILE, "utf8");
  existingId = text.match(/^TG_API_ID=(.*)$/m)?.[1]?.trim() ?? "";
  existingHash = text.match(/^TG_API_HASH=(.*)$/m)?.[1]?.trim() ?? "";
}

const apiId = Number(
  (existingId
    ? (await ask(`api_id [${existingId}]: `)).trim() || existingId
    : (await ask("api_id: ")).trim())
);
const apiHash =
  existingHash
    ? (await ask("api_hash [saved]: ")).trim() || existingHash
    : (await ask("api_hash: ")).trim();

if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
  console.error("Need a numeric api_id and a non-empty api_hash.");
  rl.close();
  process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

console.log("\nConnecting…\n");

await client.start({
  phoneNumber: async () => (await ask("Phone number of the EasyQ account (+998…): ")).trim(),
  phoneCode: async () => (await ask("Code Telegram just sent: ")).trim(),
  // Only asked when the account has two-step verification turned on.
  password: async () => await askHidden("Two-step verification password (hidden): "),
  onError: (error) => console.error("Login error:", error?.message ?? error),
});

// Written BEFORE anything else that could throw. The session is the expensive part — earning it
// costs a code and a password, and losing it to a failure in a later cosmetic step would mean
// doing the whole thing again.
const session = client.session.save();
writeFileSync(SESSION_FILE, `${session}\n`, "utf8");
console.log(`\n✔ Session written to outreach/session.txt`);

// Saved so `npm run bot` does not need them set in every new shell. Gitignored.
writeFileSync(ENV_FILE, `TG_API_ID=${apiId}\nTG_API_HASH=${apiHash}\n`, "utf8");
console.log(`✔ api_id / api_hash saved to outreach/.env`);

try {
  const me = await client.getMe();
  const name = [me.firstName, me.lastName].filter(Boolean).join(" ");
  console.log(`✔ Signed in as ${name || "(no name)"} @${me.username ?? "—"} (id ${me.id})`);
} catch (error) {
  console.log(`(could not read the account name: ${error?.message ?? error} — the session is still saved)`);
}

console.log(`
Neither file may be committed — this repo is public. Both are gitignored.

Next:
  npm run bot -- --check     connects, checks folders, sends nothing
  npm run bot                starts it for real
`);

await client.disconnect().catch(() => {});
rl.close();
process.exit(0);
