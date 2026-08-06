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
and not a `fetch`, and the CSP note below for what that costs.

## What the CRM does

- Daily booking calendar by employee, week and month views
- Today overview and live reservation list
- A notification bell over **every booking still awaiting confirmation, today onwards** — not
  just the day being browsed, because a booking taken overnight for next Tuesday is exactly the
  thing somebody needs telling about. Capped at 50
- Take a booking by hand, picking an existing client or typing a new one
- Employees with role, phone, photo, revenue, load, linked services and weekly shifts
- Which clients belong to a given employee, and their visits with that person
- Service catalogue with create/edit/archive, employee binding and a picture per service
- Client book with visit history and spend, keyed on phone so repeat visits merge
- Cash desk and analytics from the shared `payments` ledger
- Staff logins with three permission levels, enforced server-side
- Branding: logo, booking-page colours, and what the booking page asks for first
- Share links and a printable QR for the public booking page, with a copy button on each
- An in-product **Guide**, and a guided tour, both role-aware

Everything the CRM shows is built by one function, `getCrmPayload`, and then narrowed per role
by `redactPayloadFor`. Both are in `src/worker.ts`.

**The dashboard and the cash desk both count on the server.** Two bugs came out of doing it
elsewhere: KPI labels were built as Russian prose in the Worker and rendered verbatim, so an
Uzbek owner read Russian on their own dashboard (the payload now carries a `labelKey` and
`hintValues` instead of copy); and the cash desk built its breakdown client-side out of the
day's bookings, so money taken today against a booking scheduled next week vanished from the
list while still counting in the total above it. It now sends the payment rows, filtered on
**when the money was taken**, which is the same basis as the headline figure.

## The Guide, and the tour

Two things, both **role-aware**, both without screenshots.

`src/crm/Help.tsx` is the manual: twelve topics, each declaring the screen it explains, each
with a button that opens that screen. `src/crm/Tour.tsx` is nine steps of first-run
orientation. A topic or step whose screen the reader cannot open is **not rendered**, and steps
that survive get different copy per role — the previous tour told a specialist to add services
on a screen with no nav item and promised access rights to people who cannot grant them.

**No screenshots, deliberately.** In one working day the booking link moved screens, Settings
lost two sections, the light/dark toggle went away and the tour was rebuilt. Every screenshot
taken that morning would now be showing a product that does not exist — and nothing would fail:
an out-of-date picture renders perfectly. A button to the live screen is right by construction.

The Guide sits **below the working screens, beside Settings**. Dashboard through Branding are
the shop's daily work; the manual is not.

## Subscriptions

Every new business gets **30 days free**, set at signup from the date in the shop's timezone.
After that the CRM stops and offers the four plans — 175k / 299k / 499k / 799k so'm a month, by
team size.

**Never below the featured tier.** `recommendPlan` floors at `p5` (299k) rather than picking the
cheapest tier that fits, so a one-chair shop is offered the plan the business wants to sell.
`src/shared/plans.ts` holds the prices and the rule; they are written down in exactly one other
place, `outreach/lib/messages.mjs`, and the two must agree.

**What expiry blocks:** the CRM, and only the CRM. The public booking page and both Telegram
bots keep working. The shop owes money; their customers do not, and a customer who cannot book
books somewhere else — which costs the shop the money being asked for.

**It fails open.** A business with no `plan_expires_at` — every row predating this feature —
counts as active, and so does one whose date will not parse. Locking a paying shop out of its
own calendar over a missing migration or a bad string is a worse failure than a free week.

**There is no payment gateway.** Choosing a plan opens a Telegram chat with the request already
written — `t.me/<manager>?text=<message>`, which Telegram documents for **user** links and not
only for bots. The message is in the owner's own language and names their plan, price, business
and team size; the price is grouped `ru-RU` in all three languages so it matches the card they
just tapped. Somebody then activates it by hand:

```sql
UPDATE businesses SET plan = 'p5', plan_started_at = date('now'), plan_expires_at = date('now', '+30 day') WHERE slug = 'their-slug';
```

## Security

### Rate limiting

`src/server/rateLimit.ts`, counters in the `rate_limit` table. Fixed windows, keyed on
`CF-Connecting-IP` — which the edge overwrites on every request, so unlike `X-Forwarded-For` the
caller cannot choose their own bucket.

Applied to login, sign-up, feedback, subdomain checks, public bookings, verification starts and
image uploads.

**Both login doors, not one.** `/api/auth/login` was limited and `/api/auth/session-login` was
not, so the limit only decided which URL an attacker would use. Both are now limited per IP
*and* per username, so a distributed attempt on one account still fills a bucket, and both burn
a decoy hash on an unknown username so timing does not answer "does this account exist".
`scripts/security-check.cjs` enumerates every block that verifies a password and asserts the
throttle on each.

Login is counted **before** the password hash, because those PBKDF2 iterations are the cost
being defended — unlimited login attempts were a way for a stranger to spend the account's CPU.
100k iterations, which is Cloudflare's ceiling: 600k is the OWASP figure and the Workers runtime
refuses it outright. See the note on `PBKDF2_ITERATIONS` in `src/server/auth.ts`.

Image uploads are limited **per business**, not per IP: they are authenticated, so the thing
being bounded is an owner replacing a logo in a loop, 512 KB of D1 write at a time.

**It fails open, and it does nothing until the migration is applied.** A limiter that 500s takes
down the endpoint it protects, and pushing to `main` deploys before anyone can run SQL. Until
`migrations/2026-08-03-rate-limit.sql` has run, every call logs `RATE LIMITING IS OFF` — which
means "no error" and "no limiter" look identical from outside, so prove it rather than assuming
it (burst `/api/subdomain/check` and watch for a 429).

### Headers

`withSecurityHeaders` wraps the router's output rather than being applied per route, so a new
route cannot ship without them: `nosniff`, `strict-origin-when-cross-origin`, `base-uri 'self'`,
and `frame-ancestors` / `form-action` as **allowlists**.

Neither is `'self'`, and that is not laziness:

- `frame-ancestors` has to keep the landing site's demo iframe working, so it lists `'self'`
  plus the tenant roots.
- `form-action 'self'` **broke login**. The login form posts credentials cross-origin to
  `<slug>.easyq.uz/api/auth/session-login` so the tenant host sets its own cookie; `'self'`
  blocked it silently — no redirect, and a page that appeared to do nothing. A CSP that forbids
  something the app does is a broken feature, not a stricter policy.

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

The failure mode to watch for is a **new field, not a new role**. It has now happened three
times, and the shape is always the same: the gate lists money that is its own field, and misses
money that travels as a **property of something else**.

| Leaked | How | Found by |
| --- | --- | --- |
| `paymentsToday` | added to the payload, not to the gate | reading a real specialist's payload |
| `bookingsCountByStaff` | transport field for scoping one donut | caught before shipping |
| `booking.payment` | hangs off every booking card and every line of a client's visit history | grepping a live payload for a non-zero amount |

The third was the widest: a specialist received what each customer paid, what they still owe and
an itemised history with amounts and methods — for every booking on their calendar. **Nothing
renders any of it**, which is exactly why it survived; the screens show a specialist no money at
all, so from the outside the role looks clean.

So the rule is: **read the payload, not the screen.** `scripts/security-check.cjs` now asserts
one exact stripper call per payment-bearing collection, with no shared fallback pattern — see the
note there about the version of that check which passed on broken code.

**Redaction is not enough on its own; the UI has to agree.** Blanking `booking.payment` server-side
made the booking modal render "0 so'm paid, 0 outstanding" to a specialist for a customer who had
paid in full — a confident false statement they could repeat to that customer, which is worse than
the leak it replaced. The modals now hide money entirely for roles without `payment:write`, gated
on the same `can()` matrix the Worker uses. **Absent beats wrong.**

### Credentials are never stored in the clear

A generated password is shown **once**, at the moment it is generated, and never stored. All the
database keeps is `crm_temp_password_pending`, the one bit the UI needs: is this account still
on a password we issued. If it is lost, generating another is one tap.

Before 2026-08-04, `crm_temp_password` held the readable password for every business and every
staff member indefinitely — so read access to the database was login access to every account,
and both bots bind the same D1. The hash beside it was always the real credential; that column
was a spare key under the mat.

## Branding

Its own sidebar screen, owner-only. Three parts:

**Logo.** Uploaded through the CRM and stored in D1 (`crm_images`). Shown on the booking
page, in the CRM sidebar, and in the Branding preview. Without one, the first letter of the
business name over the business's own accent.

**Colours.** The owner picks background, text and accent; the other nine tokens are derived
in `src/shared/brand.ts`. The text/background pair must clear WCAG AA (4.5:1) or the save is
refused — the settings screen and the Worker call the same function, so the disabled button
and the 400 cannot disagree.

The **booking page** takes all twelve tokens. The **CRM takes the accent only.** The sidebar
gets its own accent derived against the navy, or a business with a dark brand would have an
invisible active nav item. See `src/crm/brand-shell.ts`.

**Booking order** (`businesses.booking_flow`) — what a customer is asked for first:

| Value | Booking page |
| --- | --- |
| `service_first` | service, then specialist. The default, and what `NULL` means |
| `staff_first` | specialist, then service, with services narrowed to that person |
| `time_first` | date and time, then service, then specialist |
| `service_only` | service only; the specialist is assigned and never shown |

A service with **no specialist assigned is not offered at all** — there is nobody to give it
to. The services table flags those in amber so the owner can see why one vanished.

## On a phone

Both the CRM and the booking page were audited at 320 / 375 / 414, every screen, every role.

**Wide things scroll inside themselves.** The day calendar (620px), the customers table (539px)
and the services list all live in `overflow-x: auto` wrappers, so they scroll within their own box
and **the page itself never scrolls sideways**. The sidebar becomes an off-canvas drawer at 820px,
opened by `.crm-burger`.

That distinction is the whole audit: "off-screen" and "inside a scroller" look identical in a
screenshot. The way to tell them apart is to walk each overflowing element's ancestors looking for
one that can actually scroll to reveal it — anything with no such ancestor is **clipped and
unreachable**, which is data the owner cannot get to. Every screen currently reports zero of those.

**Inputs are 16px below 820px.** Not a preference: Safari on iOS zooms the whole page when a
focused input is under 16px, and the CRM's are 14–14.5px by design for a dense desktop UI. Tapping
the login field on an iPhone used to jerk the page and magnify it. One media query on bare
`input`/`textarea`/`select` with `!important`, because most of these get their size from an inline
style object and have no class to hook.

**Touch targets.** Nothing in the CRM is under 36px. Small icon buttons keep their painted size and
carry a 44px hit area on a `::after` pseudo-element — the paint does not change and the layout does
not move. That trick is only safe on an **isolated** control: an oversized overlay on one of several
adjacent buttons swallows its neighbour's edge and makes the row worse. For touching segments (the
language pills) grow them vertically instead, or you have only moved the boundary a thumb can miss.

### Breakpoints measure the viewport, the top bar does not

The one to remember. Media queries see the **viewport**, but the top bar sits beside a 248px
sidebar, so its real width is `viewport - 248` until the sidebar collapses at 820. Crowding relief
therefore belongs at **1024**, not 820: `1024 - 248 = 776`, which is the width the old rule was
tuned for. Getting this wrong gave the whole page a horizontal scrollbar across 856–1024 with the
search field squeezed to 64px.

Below 820 the sidebar becomes a drawer and the bar gets its full width back; the language pills and
the "new booking" label stay hidden there because the drawer carries them. **There is no search on
a phone** — `.crm-search` is `display: none` below 1024, deliberately.

### Two traps worth knowing

**A `min-width` on a flex child is a floor it will not cross.** 150px on the search field forced the
bar wider than the window. If something must shrink, let it.

**`minWidth: 0` can hide a bug rather than fix one.** The dashboard's donut legend had it, which
promised the legend could shrink to nothing while its text refused to — so nothing ever wrapped and
the card overflowed a 320px viewport. It wraps with a real floor now, and that floor is 140px
because that is what the container measures, not because 140 is a tidy number.

## The booking page

A hub of full screens rather than one scrolling form. The customer starts from whichever of
specialist / date / services they already know, and the order of what follows depends on **both**
that entry and the owner's `booking_flow` — one fixed order cannot serve all three, and asking
for a specialist first when somebody began by picking Thursday at six is how a booking flow
starts feeling like paperwork.

The setting used to reorder the menu rows and nothing else: past the first tap every shop
behaved like `service_first`. `scripts/booking-order-check.cjs` now asserts the walked order for
every flow × entry pair.

**A chosen day is named with its date.** `dayLabel` says "Today" and "Tomorrow", and for anything
past that **"Mon, 10 August"** rather than a bare weekday. The bookable window is 21 days, so "Mon"
alone was three different Mondays — on the summary rows and the final review screen, the last thing
a customer sees before committing. Auto-selecting the nearest free day made that worse rather than
better: the customer no longer picks a date at all, so they had nothing to check the booking
against. The `months` array exists in all three locales, and the Russian entries are genitive
("августа") because they were written for exactly this.

**It opens on a day that has room.** `GET /api/public/available-days` returns which of the next
N days (clamped to 30) have availability, computed with the same `getPublicSlots` the slot list
uses — so "this day has room" cannot disagree with what the day then offers. One request rather
than the browser probing each date, which on a phone would be fourteen round trips re-reading
the same rows. Empty days are dimmed, not hidden.

A booking may hold several services, capped at two hours in total, and availability reserves
the SUM of their durations. The whole selection lives in the URL —
`?m12&s3&s7&d202607311430` — so a refresh, the back button, or a link forwarded to whoever is
paying all resume the same booking. See `src/shared/bookingUrl.ts` and `src/shared/basket.ts`.

Empty states say **which choice is missing** rather than "no times available", because the
second reads as the shop being full when the real cause is that nothing has been picked yet.

## Telegram links

A shop's share panel offers three links, and the client-bot one carries the shop:

```
https://t.me/easyqueue_client_bot?start=<slug>
```

Without the payload, a shop handing out `t.me/easyqueue_client_bot` was sending its own
customers into a directory of every business on the platform, competitors included. The payload
falls back to `b<id>` for a business with no slug. `scripts/deeplink-check.cjs` asserts every
link is built this way.

## Image uploads

Logos, specialist photos and service pictures share one path, in `src/shared/imageFile.ts`.
Logos and staff live in `crm_images`; services have their own table (`crm_service_images`)
because that first one is keyed `PRIMARY KEY (business_id, staff_id)` and SQLite cannot alter a
primary key — service 14 and staff 14 both exist, so one column could not hold both. The storage
function takes the table as an argument rather than being copied, since the byte validation is
the part that must never drift between them.

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
- Rate limited per business, 40 an hour.

There is **no virus scanning**, and there cannot be inside a Worker — no engine inspects a
genuine PNG for a payload, and a Worker has none to call. The four guarantees above are what
stands in its place. Real scanning needs an external service.

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

Create `.dev.vars` (gitignored, and there is no committed example — `.dev.vars.*` is ignored
too, so one could not be checked in):

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

## Checks

Six scripts, plain Node, no test runner and no dependencies — which is why they are `.cjs` and
run with no install on a machine where `npm ci` fails:

```bash
node scripts/security-check.cjs
```

| Script | Asserts |
| --- | --- |
| `security-check.cjs` | every login door is throttled, every authed route states a capability, money is redacted — including the payment summary hanging off every booking — headers are set, no plaintext passwords |
| `sql-bind-check.cjs` | every `prepare`/`bind` pair agrees on arity — invisible to TypeScript |
| `tour-check.cjs` | the tour's steps and copy, per role |
| `help-check.cjs` | every Guide topic points at a screen that exists and the reader can open |
| `booking-order-check.cjs` | the order a customer walks, per flow and per entry point |
| `deeplink-check.cjs` | every Telegram link carries the shop |

They assert against the **source**, and two of them had to be taught to strip comments first —
the comment explaining a fix contains the string the check is looking for, so it passed on the
explanation rather than the code.

**Test the check, not just the code.** A check that passes proves nothing until you have watched it
fail. The payment-stripping check accepted any of three patterns per field, and one of them was
present for a different field regardless — so deleting a whole line of redaction left all 73 green.
The way to find that out is to break each thing on purpose and confirm the matching assertion goes
red, one at a time.

`outreach/` has its own suite: `npm --prefix outreach test`.

## Deploy

Push to `main`. **Cloudflare's own Git integration builds and deploys**, not GitHub Actions;
the Actions workflow is a typecheck gate that deploys nothing. Worth knowing, because it went
red for days without stopping a single deploy. To deploy by hand:

```bash
npm run deploy
```

Both run `tsc --noEmit` first. `vite build` alone strips types without resolving them, which
is how a file calling twelve names it never imported once deployed green.

## Database

Migrations live in `migrations/`, one file per change, each with the reasoning at the top.
`package.json` has a `db:migrate:local:*` and mostly a `db:migrate:remote:*` script per file —
but `wrangler` does not run on the dev machine, so **production migrations are applied through
the Cloudflare dashboard D1 console** (Storage & Databases → D1 → `easyqueue_db` → Console).

A fresh local database is `npm run db:init:local` followed by each `db:migrate:local:*` in
filename order.

**Read the migration rule in [TODO.md](TODO.md) before running one against production** —
migrate first, deploy second, run new statements one at a time, and verify the column exists
rather than trusting the console's report. Doing it the other way round cost a login outage.
The full applied-to-production table is in TODO.md.

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

## Outreach

`outreach/` runs the project's **own Telegram account** to send the intro to a list of
businesses, answer the easy replies and sort the chats into folders — driven entirely from
Saved Messages. It is in this repo for one clone but runs on your machine, not in the Worker:
MTProto needs a long-lived socket, and a Bot API bot physically cannot start a conversation.

```bash
npm run bot:check
```

See [outreach/README.md](outreach/README.md). Its session file, `.env` and contact ledger are
gitignored and must stay that way — **this repository is public**, and that session string is
the account login.

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
  the digit that separates them arrives. The empty field is **seeded with `+998 ` on focus**;
  as a placeholder alone it looked seeded when it was not, and people typed nine digits into an
  empty field. Caret position is restored by digit count, not character index, or it drifts a
  place every time reformatting moves a space.
- Availability has one definition — `src/shared/availability.ts`, shared by the owner's
  calendar and the public booking API. Do not fork it.
- Money is UZS. A **price** of 0 prints nothing, because it means nobody set one; a **total**
  of 0 prints `0`, because the day really did take zero. `fmtPrice` vs `fmtSom`. That rule assumes
  the reader is allowed to see the total at all — where they are not, drop the figure rather than
  print a redacted `0`, which reads as a fact. See *Roles*.
- The top bar's order is search, languages, guide, bell, new booking. The two icon buttons sit
  together on purpose; the search is a `flex: 0 1 300px` child of the control cluster, not a
  `flex: 1` child of the header, which is what used to pin it against the page title.
- Tooltips render through a **portal**, positioned `fixed`, and clamp themselves to the
  viewport. Inline they were clipped by whichever card or modal they sat in — the tooltip was
  correct and invisible.
- The bots can still double-book, and a bot booking will not merge with a web booking by the
  same person. Both need changes in the bot repo — see *Known limits* in [TODO.md](TODO.md).
