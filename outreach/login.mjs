// One-time sign-in for the EasyQ project account.
//
// Run this once. It asks Telegram to send a login code to the account, you type it in here, and
// it writes a SESSION STRING to session.txt. Every later run of send.mjs reads that file and
// never asks again.
//
// Nothing you type here is stored except the resulting session string, and nothing leaves your
// machine — this talks to Telegram directly.
//
// The session string is the login. Anyone holding it is signed in as this account with no code
// and no password. It is gitignored; if it ever escapes, revoke it from
// Telegram → Settings → Devices → terminate the session.

import { writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const SESSION_FILE = new URL("./session.txt", import.meta.url);

const rl = createInterface({ input: stdin, output: stdout });
const ask = (q) => rl.question(q);

/**
 * Read a value without echoing it to the terminal.
 *
 * Used for the 2FA password only. It is passed straight to Telegram and never written down.
 */
async function askHidden(q) {
  stdout.write(q);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode?.(true);
  let value = "";
  for await (const chunk of stdin) {
    const char = chunk.toString("utf8");
    if (char === "\r" || char === "\n") break;
    if (char === "") { stdout.write("\n"); process.exit(130); }
    if (char === "" || char === "\b") { value = value.slice(0, -1); continue; }
    value += char;
  }
  stdin.setRawMode?.(wasRaw ?? false);
  stdout.write("\n");
  return value;
}

if (existsSync(SESSION_FILE)) {
  const answer = await ask("session.txt already exists. Overwrite and sign in again? (y/N) ");
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Left it alone.");
    rl.close();
    process.exit(0);
  }
}

console.log(`
Get an API ID and API HASH first, once, from https://my.telegram.org
  -> API development tools -> create an application (any name will do)

These identify the APP, not the account. They are not secret in the way the session is, but
keep them out of the repo anyway.
`);

const apiId = Number((await ask("api_id: ")).trim());
const apiHash = (await ask("api_hash: ")).trim();

if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash) {
  console.error("Need a numeric api_id and a non-empty api_hash.");
  rl.close();
  process.exit(1);
}

const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

await client.start({
  phoneNumber: async () => (await ask("Phone number of the EasyQ account (+998...): ")).trim(),
  phoneCode: async () => (await ask("Code Telegram just sent: ")).trim(),
  // Only asked when the account has two-step verification enabled.
  password: async () => await askHidden("Two-step verification password (hidden): "),
  onError: (err) => console.error("Login error:", err?.message ?? err),
});

const session = client.session.save();
writeFileSync(SESSION_FILE, `${session}\n`, "utf8");

const me = await client.getMe();
console.log(`
Signed in as ${me.firstName ?? ""} ${me.lastName ?? ""} (@${me.username ?? "no username"}), id ${me.id}
Session written to outreach/session.txt — gitignored, do not commit or paste it anywhere.

Next:
  1. put one username per line in outreach/recipients.txt
  2. npm run dry      (resolves everyone, sends nothing)
  3. npm run send
`);

await client.disconnect();
rl.close();
process.exit(0);
