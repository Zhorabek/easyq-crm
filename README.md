# EasyQ CRM

React + TypeScript CRM for EasyQueue businesses, served by a single Cloudflare Worker that
also owns the public booking page and the same D1 database the Telegram bots use.

One Worker serves three things:

| Host | What it serves |
| --- | --- |
| `crm.easyq.uz` | sign-in, and the CRM for whoever signs in |
| `<slug>.easyq.uz` | that business's CRM |
| `<slug>.easyq.uz/booking` | that business's public booking page, no auth |

Signing in on `crm.easyq.uz` redirects to the business's own subdomain, because the session
cookie is host-only — see `submitToTenantHost` in `src/App.tsx` for why that is a form POST
and not a `fetch`.

## What the CRM does

- Daily booking calendar by employee, week and month views
- Today overview and live reservation list
- Take a booking by hand, picking an existing client or typing a new one
- Employees with role, phone, photo, revenue, load, linked services and weekly shifts
- Which clients belong to a given employee, and their visits with that person
- Service catalogue with create/edit/archive and employee binding
- Client book with visit history and spend, keyed on phone so repeat visits merge
- Cash desk and analytics from the shared `payments` ledger
- Staff logins with three permission levels, enforced server-side
- Branding: logo, booking-page colours, and what the booking page asks for first
- Share links and a printable QR for the public booking page

### Roles

`owner`, `manager`, `specialist`. The matrix is one table in `src/server/permissions.ts`,
written out per role rather than derived from a hierarchy, so reading down a column tells you
exactly what a manager can do.

The UI hides what a role cannot do, but **that is cosmetic**. The Worker rejects the call:
every mutating endpoint runs `requireCapability`, and handlers take an `Actor` rather than a
`BusinessRow` so a forgotten check is a type error.

Two things a capability check cannot express, both handled separately in
`isScopedToOwnBookings`:

- A specialist holds `booking:status`, which alone would let them cancel a colleague's
  appointments. Status changes are additionally scoped to their own `staff_id`.
- A specialist holds `booking:create` so they can take their own regulars — and on create
  there is no existing row to check ownership against, so `createCrmBooking` **overwrites**
  the staff id with the actor's own rather than validating what was sent.

`redactPayloadFor` strips the payload down to what the role may see, and **gates on
capabilities, not role names** — a new role therefore starts restricted rather than
privileged. A specialist's client book is rebuilt from their own bookings alone, so a
colleague's takings and visit frequency cannot ride along on a shared client's row.

## Branding

Its own sidebar screen, owner-only. Three parts:

**Logo.** Uploaded through the CRM and stored in D1 (`crm_images`). Shown on the booking
page, in the CRM sidebar, and in the Branding preview. Without one, the first letter of the
business name over the business's own accent.

**Colours.** The owner picks background, text and accent; the other nine tokens are derived
in `src/shared/brand.ts`. The text/background pair must clear WCAG AA (4.5:1) or the save is
refused — the settings screen and the Worker call the same function, so the disabled button
and the 400 cannot disagree.

The **booking page** takes all twelve tokens. The **CRM takes the accent only**, because the
surface tokens are what the light/dark toggle switches, and an inline style on the root
element beats a stylesheet — writing `--bg` there would leave the toggle visibly doing
nothing. Appearance owns the surfaces, branding owns the accent. The sidebar gets its own
accent derived against the navy, or a business with a dark brand would have an invisible
active nav item. See `src/crm/brand-shell.ts`.

**Booking order** (`businesses.booking_flow`) — what a customer is asked for first:

| Value | Booking page |
| --- | --- |
| `service_first` | service, then specialist. The default, and what `NULL` means |
| `staff_first` | specialist, then service, with services narrowed to that person |
| `service_only` | service only; the specialist is assigned and never shown |

A service with **no specialist assigned is not offered at all** — there is nobody to give it
to. The services table flags those in amber so the owner can see why one vanished.

## The booking page

A hub of full screens rather than one scrolling form. The customer starts from whichever of
specialist / date / services they already know, and the order of what follows depends on that
entry — one fixed order cannot serve all three, and asking for a specialist first when
somebody began by picking Thursday at six is how a booking flow starts feeling like paperwork.

A booking may hold several services, capped at two hours in total, and availability reserves
the SUM of their durations. The whole selection lives in the URL —
`?m12&s3&s7&d202607311430` — so a refresh, the back button, or a link forwarded to whoever is
paying all resume the same booking. See `src/shared/bookingUrl.ts` and `src/shared/basket.ts`.

The step order, and what is still missing, is in [TODO.md](TODO.md).

## Image uploads

Logos and specialist photos share one path, in `src/shared/imageFile.ts` and `crm_images`.

- Accepted formats are decided by the file's **leading bytes**, never its name or
  `Content-Type` — both of those are chosen by whoever is uploading. PNG, JPEG and WebP.
- **SVG is refused outright.** It is an image to a person and an XML document with `<script>`
  support to a browser, which is the standard route from "image upload" to stored XSS.
- The browser downscales to 512px and re-encodes before uploading. That keeps rows small and
  **launders the file**: the stored bytes are the browser's own encoder output from decoded
  pixels, so a payload appended to a valid PNG does not survive. It runs client-side and so
  carries no authority — the Worker repeats every check on bytes it read itself.
- Responses carry a `Content-Type` from our own allowlist plus `X-Content-Type-Options:
  nosniff`, which is what keeps anything that did reach storage inert.

**Bytes are stored base64, in a column declared `BLOB`.** Not an accident and not worth
"optimising": D1 accepts only `ArrayBuffer` for a blob bind — a `Uint8Array` is an
ArrayBuffer*View* — and returns a blob as an **array of integers**, not an `ArrayBuffer`.
Getting either end wrong stores or serves something that is not an image while every type
annotation still checks out. Base64 has one representation in both directions. SQLite's BLOB
affinity stores what it is handed, so the text needs no schema change.

## Install

```bash
npm install
```

## Local env

Copy `.dev.vars.example` to `.dev.vars`:

```bash
APP_TIMEZONE=Asia/Tashkent
CRM_SESSION_SECRET=easyq-crm-dev-session-secret
CLIENT_BOT_USERNAME=easyqueue_client_bot
BUSINESS_BOT_USERNAME=easyqueue_business_bot
```

`CRM_BUSINESS_ID` is not used — the CRM signs in with a username and password per business.

`BUSINESS_BOT_TOKEN` is **no longer needed for logos.** It is only read to serve a photo that
was uploaded through the Telegram bot before `crm_images` existed, and that path 404s rather
than erroring when the token is absent.

## Run

```bash
npm run typecheck
```

Frontend only:

```bash
npm run dev
```

With the Worker API and a local D1:

```bash
npm run dev:worker
```

Against the real shared D1:

```bash
npm run dev:worker:remote
```

Deploy — push to `main`. **Cloudflare's own Git integration builds and deploys**, not GitHub
Actions; the Actions workflow is a typecheck gate that deploys nothing. Worth knowing, because
it went red for days without stopping a single deploy. To deploy by hand:

```bash
npm run deploy
```

Both run `tsc --noEmit` first. `vite build` alone strips types without resolving them, which
is how a file calling twelve names it never imported once deployed green.

## Local D1 setup

```bash
npm run db:init:local
```

Then, in order — each adds columns or tables the CRM needs and the bot repo's own migrations
do not create:

```bash
npm run db:migrate:local
```

```bash
npm run db:migrate:local:payments
```

```bash
npm run db:migrate:local:crm
```

```bash
npm run db:migrate:local:booking-phone
```

```bash
npm run db:migrate:local:staff-role
```

```bash
npm run db:migrate:local:staff-access
```

```bash
npm run db:migrate:local:session-version
```

```bash
npm run db:migrate:local:brand
```

```bash
npm run db:migrate:local:brand-theme
```

```bash
npm run db:migrate:local:booking-flow
```

```bash
npm run db:migrate:local:images
```

```bash
npm run db:migrate:local:service-category
```

```bash
npm run db:migrate:local:booking-services
```

```bash
npm run db:migrate:local:reviews
```

Every `db:migrate:local:*` has a `db:migrate:remote:*` twin. **Read the migration rule in
[TODO.md](TODO.md) before running one against production** — migrate first, deploy second,
and verify the column exists rather than trusting the console's report. Doing it the other
way round cost a login outage.

## Phone verification

Live, and it is contact-sharing rather than a code (`PHONE_VERIFICATION_ENABLED = true` in
`src/worker.ts`). The visitor types their number, opens the business bot through a deep link
and taps "share my number"; Telegram hands the bot a number **it** vouches for, the bot writes
it to `signup_verification` in the shared D1, and this Worker polls for it. There is no code to
intercept and nothing to brute-force.

The number the visitor typed is a stated intent, not a credential. `/api/signup` reads the
phone off the verification row, never off the request body, so the account is always created on
the **confirmed** number; when the two differ, the signup page says so rather than silently
using the other one.

The handler lives in `easyqueue-business-bot/src/handlers/signup.handler.ts` — in that repo,
not this one, because a bot has exactly one webhook and that bot's already points there.

## Notes

- The CRM reads the same D1 schema as the bots, and shares `businesses`, `staff`, `services`,
  `bookings` and `payments` with them. Additive columns only.
- Set `CRM_SESSION_SECRET` in Cloudflare secrets for production auth cookies.
- No Telegram bot token is stored in the source tree.
- Phone numbers have one definition — `src/shared/phone.ts`, built on `libphonenumber-js`.
  Stored as E.164 (`+998901234567`, `+14155552671`); Uzbek numbers keep the exact shape the
  hand-rolled version produced, so nothing needed migrating — which matters because clients are
  **keyed on the stored phone**. Mirrored verbatim into `easyq-landing`.
- Every phone field takes **any country**, and infers which one from the prefix rather than
  offering a dropdown first: `+998` shows a 🇺🇿, `+7` a 🇷🇺 or 🇰🇿, `+1` a 🇺🇸. No flag until the
  prefix is unambiguous — `+7` alone is both Russia and Kazakhstan, so a globe stands in until
  the digit that separates them arrives. The empty field is seeded with `+998 ` by its
  **placeholder only**, so the common case types nine digits and nobody has to delete anything
  to type another country's code. Caret position is restored by digit count, not character
  index, or it drifts a place every time reformatting moves a space.
- Availability has one definition — `src/shared/availability.ts`, shared by the owner's
  calendar and the public booking API. Do not fork it.
- Money is UZS. A **price** of 0 prints nothing, because it means nobody set one; a **total**
  of 0 prints `0`, because the day really did take zero. `fmtPrice` vs `fmtSom`.
- The bots can still double-book, and a bot booking will not merge with a web booking by the
  same person. Both need changes in the bot repo — see *Known limits* in [TODO.md](TODO.md).
