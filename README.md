# EasyQ CRM

React + TypeScript CRM dashboard for EasyQueue businesses, backed by the shared Cloudflare D1 database used by the Telegram bots.

## Current scope

- Daily booking calendar by employee
- Today overview and live reservation list
- Employee list with revenue, load, linked services, and weekly slots
- Service catalog with create/edit/archive and employee binding
- Weekly slot management per employee
- Client list with visit history and spend totals
- Revenue leaderboard and basic analytics
- Online booking links to the current Telegram bots

## Install

```bash
npm install
```

## Local env

Copy `.dev.vars.example` to `.dev.vars` and set the local runtime vars:

```bash
APP_TIMEZONE=Asia/Almaty
CRM_SESSION_SECRET=easyq-crm-dev-session-secret
CLIENT_BOT_USERNAME=easyqueue_client_bot
BUSINESS_BOT_USERNAME=easyqueue_business_bot
BUSINESS_BOT_TOKEN=your_business_bot_token_here
```

CRM now uses login/password per business, so `CRM_BUSINESS_ID` is no longer required for the normal UI flow.
Open the business in Telegram, go to the profile, tap `CRM доступ`, and use the shown test credentials to sign in.

## Phone verification bot (required for web sign-up)

Web sign-up confirms a phone number by having the visitor share their Telegram contact.
This needs its **own** bot — a bot has exactly one webhook, so reusing
`easyqueue_business_bot` would take its updates away from the bot service that owns it.

1. Create a bot with [@BotFather](https://t.me/BotFather) — e.g. `easyq_verify_bot`.
2. Set the Worker secrets:

```bash
npx wrangler secret put VERIFY_BOT_TOKEN
```

```bash
npx wrangler secret put VERIFY_WEBHOOK_SECRET
```

`VERIFY_WEBHOOK_SECRET` is any random string you invent; Telegram echoes it back in the
`X-Telegram-Bot-Api-Secret-Token` header and the Worker rejects anything else. Also set
`VERIFY_BOT_USERNAME` (a plain var, not a secret) if the bot is not `easyq_verify_bot`.

3. Point the bot's webhook at the CRM, using the same secret:

```bash
curl "https://api.telegram.org/bot<VERIFY_BOT_TOKEN>/setWebhook" -d "url=https://crm.easyq.uz/api/telegram/verify-webhook" -d "secret_token=<VERIFY_WEBHOOK_SECRET>"
```

4. Apply the migration:

```bash
npm run db:migrate:remote:verification
```

Until `VERIFY_BOT_TOKEN` is set, `POST /api/signup` returns 503 `verify_unconfigured`
rather than creating anything — the old `code: "1111"` bypass is gone.

## Run

Frontend build check:

```bash
npm run typecheck
```

Frontend only:

```bash
npm run dev
```

CRM with Worker API and D1:

```bash
npm run dev:worker
```

CRM with the real shared Cloudflare D1 database:

```bash
npm run dev:worker:remote
```

If you want to run against a local D1 database instead, initialize the schema first:

```bash
npm run db:init:local
```

If your local DB was already created before the latest slot migration, also run:

```bash
npm run db:migrate:local
```

If your local DB was created before the payments ledger was added, also run:

```bash
npm run db:migrate:local:payments
```

Deploy:

```bash
npm run deploy
```

## Notes

- The CRM reads the same D1 schema as the bots.
- Set `CRM_SESSION_SECRET` in Cloudflare secrets for production auth cookies.
- `BUSINESS_BOT_TOKEN` is required for business photo preview/upload in CRM, because CRM proxies the photo through the business bot's Telegram file access.
- Earnings and finance analytics now come from the shared `payments` ledger, not only from booking status.
- `wrangler dev` uses a local D1 by default, so it will be empty until you initialize it.
- It does not store Telegram bot tokens in the source tree.
- Client phone/WhatsApp data is not available from the current bot schema, so the CRM currently focuses on booking history and spend analytics.
