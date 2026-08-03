# Outreach

Runs the EasyQ project's **own Telegram account**: sends the intro to a list of businesses,
answers the easy replies itself, sorts the chats into folders, and reports back — all driven
from **Saved Messages**, so you run it from your phone.

## Why it is not a bot, and not in the Worker

A Bot API bot **cannot start a conversation.** `sendMessage` needs a `chat_id`, and one only
exists after the person has messaged the bot first — so a bot physically cannot deliver a cold
intro. That is a Telegram rule, not a missing feature.

And MTProto needs a long-lived socket and persistent session state, which a Cloudflare Worker
does not have. So this lives in the repo for one clone, but runs on your machine with `node`.

## Setup, once

```bash
npm install
```

Get an `api_id` and `api_hash` from [my.telegram.org](https://my.telegram.org) → *API
development tools*. They identify the app, not the account.

```bash
npm run login
```

Asks for the account's phone, the code Telegram sends, and the two-step password if there is
one. Everything is typed by you, locally.

**`session.txt` is the login.** Anyone holding it is signed in as the account — no code, no
password, nothing to reset. Gitignored. If it escapes: Telegram → Settings → Devices →
terminate.

`npm run login` also writes `outreach/.env` with the api_id/api_hash, so later runs need no
setup. Also gitignored.

## Check it before trusting it

```bash
npm run bot -- --check
```

Connects, confirms it can write to Saved Messages, and creates the folders. **Sends nothing to
anybody** — the only chat it touches is the one with yourself. Run this first: the folder API
is the part most likely to fail on a given account, and finding out here beats finding out
halfway through a send.

## Running it

```bash
npm run bot
```

Leave it running. It reconnects on its own; it does nothing until you tell it to.

## Driving it from Saved Messages

Put your list in a Saved Message — one per line, `@name`, `name` or a `t.me/` link:

```
@barber_house_tashkent
@studio_beauty_uz
t.me/some_salon
```

Then **reply to that message** with:

| command | |
| --- | --- |
| `/send` | sends the intro to everyone in the replied-to message |
| `/send dry` | resolves them all, sends nothing — run this first |
| `/report` | full status of everyone contacted |
| `/status @name` | one person |
| `/stop` | halt a run after the current message |
| `/help` | the list |

`/report` comes back like this:

```
Contacted   38 of 40
Replied     11
  • "+"          6
  • questions    4
  • declined     1
No reply    22  (48h+ after sending)

Did not go through
  blocked / privacy   2
  no such username    1
```

## What it answers by itself

| they write | it does |
| --- | --- |
| `+`, `да`, `ok`, `ha`, `mayli`… | sends the follow-up, marks them interested, pings you |
| "можно на узбекском?" | resends the whole intro in Uzbek |
| a pricing / free-month / setup / Telegram / staff question | answers from the FAQ, in their language |
| anything else | one short "a manager will reply", then **silence** — and it forwards their message to your Saved Messages |
| "не надо", "не интересно", "spam" | **nothing at all**, marked declined |

Every word it can ever say is in [`lib/messages.mjs`](lib/messages.mjs) — one file, so you can
read the account's entire vocabulary in one sitting. Edit the FAQ there.

It never improvises. If it is not confident, a person answers.

## Folders

Chats are moved into `EQ Waiting`, `EQ Answered` and `EQ Blocked` as their status changes, so
the inbox sorts itself.

The names are cramped for a reason: **Telegram caps a folder title at 12 characters**, and over
that `UpdateDialogFilter` fails with `MESSAGE_TOO_LONG` — an error about a message, on a call
containing no message, naming neither the field nor the limit. The first version used
`EasyQ · Waiting` (15) and silently created nothing. `lib/folders.mjs` now refuses to load if a
title goes over.

Still **best-effort**: the API shape has changed between Telegram layers, and accounts have a
limit on how many folders they may have. If it fails you get a log line and nothing else breaks
— the real record is `state.json`, and `/report` never depends on folders.

## Not getting the account limited

- **45–120 seconds between messages, randomised.** ~30 messages ≈ an hour. A fixed interval is
  itself a pattern.
- **It only ever writes to people on your list.** A stranger who messages the account gets no
  reply at all. An account that answers anything is an account that gets reported.
- **Never groups, never channels, never other bots.**
- **At most 4 auto-replies per person, 30 per hour overall**, with a cooldown — so a
  misfiring rule cannot spiral, and two bots cannot talk to each other forever.
- **`FLOOD_WAIT`** is a pause: Telegram says how long, it waits exactly that and retries.
- **`PEER_FLOOD` stops everything** and tells you. Past that the account cannot write to
  non-contacts; continuing only deepens it. It clears in a few days.

Start with a short list the first time, not two hundred people.

## It will not message anyone twice

`state.json` is the ledger, written atomically after every change. Anyone already `sent` is
skipped on the next `/send`. Crash, `FLOOD_WAIT`, closed laptop — restarting resumes.

If it will not parse, the bot **refuses to start** rather than beginning from an empty ledger,
because that would message everybody again.

## Tests

```bash
npm test
```

Covers every decision about who gets messaged and what gets said — username extraction,
commands, `+` detection, FAQ routing, language, state and reporting. 114 checks.

It does **not** cover sending, folders or event delivery: those need a real session, and they
are written to fail soft instead. Three real bugs came out of these tests, including `"работает"`
matching the keyword `"бот"` — which answered "does it work on my phone?" with the Telegram
blurb.

## Three Telegram traps, none of which produce an error

Every one of these cost real time during the build. All three fail by doing nothing at all.

**1. A folder title over 12 characters fails with `MESSAGE_TOO_LONG`** — an error about a
message, on a call that contains no message, naming neither the field nor the limit.
`EasyQ · Waiting` is 15 and silently created nothing. `lib/folders.mjs` now refuses to load if
a title goes over.

**2. Without `updates.getState`, no event ever arrives.** In MTProto a client receives no pushed
updates until it asks for the current update state. `connect()` does not do this. The account
connects, authorises, sends messages and reports itself perfectly healthy, and every command
typed into Saved Messages vanishes. Measured: 0–1 raw updates in 45 seconds before, immediate
delivery after. `getDialogs` is needed too — GramJS resolves the chat for each message event and
drops it when the entity is not cached.

**3. Messages in Saved Messages arrive with `out=false`.** You are both sender and recipient, and
Telegram resolves that as *incoming*. Gating the command handler on `if (!message.out) return`
threw every command away on its first line. Saved Messages is identified by CHAT ID alone — the
chat whose id is your own, which no other conversation can produce.

## Files


| | |
| --- | --- |
| `bot.mjs` | the whole thing |
| `lib/messages.mjs` | every word it can say, RU + UZ |
| `lib/replies.mjs` | what it answers, and when it stays quiet |
| `lib/parse.mjs` | usernames and commands out of text |
| `lib/state.mjs` | the ledger |
| `lib/folders.mjs` | folder moves, best-effort |
| `session.txt` | the account login — gitignored |
| `state.json` | who has been contacted — gitignored |
