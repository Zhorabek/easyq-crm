# Outreach

Sends the EasyQ intro message from the project's **own Telegram account** to a list of
usernames.

## Why it is not a bot, and not in the Worker

A Bot API bot **cannot start a conversation.** `sendMessage` needs a `chat_id`, and one only
exists after the person has messaged the bot first — so a bot physically cannot deliver a cold
intro. That is a Telegram rule, not a missing feature, and it is why this drives a real account
over MTProto instead.

That in turn is why this does not live in `src/` with everything else: MTProto needs a long-lived
socket and persistent session state, and a Cloudflare Worker has neither. It is in this repo so
there is one thing to clone, but it runs on your machine with `node`.

## Setup, once

```bash
npm install
```

Get an `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org) → *API
development tools* → create an application. These identify the app, not the account.

```bash
npm run login
```

It asks for the phone number of the EasyQ account, then the code Telegram sends it, then the
two-step password if the account has one. Nothing is stored except a session string in
`session.txt`.

**`session.txt` is the login.** Anyone holding it is signed in as that account with no code and
no password prompt. It is gitignored — never commit it, never paste it into a chat. If it gets
out, revoke it: Telegram → Settings → Devices → terminate the session.

Then set the same two values in the environment for sending:

```bash
$env:TG_API_ID="123456"; $env:TG_API_HASH="your_api_hash"
```

## Sending

Put one username per line in `recipients.txt` (see `recipients.example.txt`). Then:

```bash
npm run dry
```

That resolves every username against Telegram and sends nothing — it is how you find the dead
usernames and typos before they cost you anything.

```bash
npm run send
```

## What it does about getting the account limited

Telegram restricts how fast an account opens conversations with strangers. Two things follow
from that:

- **The gap between messages is 45–120 seconds, randomised.** A fixed interval is itself a
  detectable pattern. ~30 messages therefore takes about an hour. Override with
  `node send.mjs --min 60 --max 180`.
- **`FLOOD_WAIT` is handled**, not fatal: Telegram says how long to wait, the script waits
  exactly that and retries the same person once.
- **`PEER_FLOOD` stops the run.** That error means the account is now restricted from writing
  to non-contacts. Continuing sends nothing and deepens it. It clears on its own, usually in
  a few days.

Start with `--limit 10` on a first real run rather than pointing it at two hundred people.

## It will not message anyone twice

Every attempt is appended to `sent.jsonl`, and successful deliveries are skipped on the next
run. Crash, `FLOOD_WAIT`, closed laptop, `Ctrl-C` — re-running resumes instead of starting over.
Failures are *not* recorded as sent, so a username that failed for a fixable reason is retried.

To deliberately re-send to someone, delete their `"status":"sent"` line from `sent.jsonl`.

## Files

| | |
| --- | --- |
| `message.ru.txt` | the text that gets sent — edit it here |
| `recipients.txt` | your list, gitignored |
| `session.txt` | the account login, gitignored |
| `sent.jsonl` | who has been written to, gitignored |

`message.ru.txt` is sent as plain text, so the emoji and bullets go out exactly as written.
Telegram messages are the one place in this project where emoji are fine — the no-emoji rule in
[TODO.md](../TODO.md) is about UI chrome, which cannot hold an SVG here.
