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

Copy `.dev.vars.example` to `.dev.vars` and set at least one business selector:

```bash
CRM_BUSINESS_ID=1
APP_TIMEZONE=Asia/Almaty
CLIENT_BOT_USERNAME=easyqueue_client_bot
BUSINESS_BOT_USERNAME=easyqueue_business_bot
```

You can also use `CRM_BUSINESS_TELEGRAM_ID` instead of `CRM_BUSINESS_ID`.

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
- Earnings and finance analytics now come from the shared `payments` ledger, not only from booking status.
- `wrangler dev` uses a local D1 by default, so it will be empty until you initialize it.
- It does not store Telegram bot tokens in the source tree.
- Client phone/WhatsApp data is not available from the current bot schema, so the CRM currently focuses on booking history and spend analytics.
