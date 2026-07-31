# EasyQ CRM — outstanding work

Last updated 2026-07-30. Everything below is either not started or waiting on someone.
Items are ordered within each section by what I'd do first.

---

## Needs a person, not code

Nothing here can be done from the repo.

- [ ] **Rotate `@easyqueue_business_bot`'s token.** It was pasted in plaintext in a chat on
      2026-07-28 and must be treated as compromised. `/revoke` with
      [@BotFather](https://t.me/BotFather). Logos no longer depend on it, but the two bots do.
      It has never been in the source tree; if it is set as a Worker secret, replace that too.
- [ ] **Assign specialists to services on `barber777`.** `Beard cut`, `Beard cut for babies`
      and `haircut` have nobody assigned, so they are **not offered on the booking page** —
      only `test 123` is bookable. This is intended behaviour, not a bug: there is nobody to
      give those services to. The services table flags them in amber. Services → the service →
      pick who performs it.
- [ ] **Check `barber777`'s booking order.** It is currently `service_only`, so customers
      never see a specialist and one is assigned for them. If that was a test, change it on
      Branding → Booking order.
- [ ] **Delete two test bookings** on `barber.easyq.uz`, both Thu 30 Jul:
      `11:00 — TEST - please delete` and `09:00 — Outage probe`. They hold real slots.
- [ ] **Delete one orphaned row:** `DELETE FROM users WHERE id = 1604;` — left behind when
      the `zz-probe-not-real` business was removed.
- [ ] **Try a staff login end to end.** Open a staff member → *CRM access* → grant Specialist,
      then sign in with the issued credentials in a private window. Confirm they see only
      their own day, only their own clients, no money, and no other staff. Confirm they CAN
      book onto their own schedule and that the specialist field is fixed to them. This is the
      one path that cannot be tested without a login.
- [ ] **Give `barber777` a roster.** Staff exist but weekly slots are thin, so the booking
      page can read "No free times". Jadval → the staff member → set hours.

---

## Security — captcha is currently OFF

- [ ] **Turn the signup captcha back on when the client is ready.** Off at their request
      (commit `22b0984`). Flip `SIGNUP_CAPTCHA_ENABLED` to `true` in **both**
      `easyq-crm/src/worker.ts` and `easyq-landing/src/components/Signup.tsx` — they must
      agree, or submit either always fails or shows pointless friction. Nothing else needs
      changing; the module, table, endpoint, field and strings are all still in place.

      While it is off, `POST /api/signup` is unauthenticated and writes a `users` row and a
      `businesses` row per call, with nothing in between. The per-phone and per-IP limits
      cover bookings and feedback, not signup. **If it gets abused before the captcha comes
      back**, the quickest stopgaps are an IP rate limit on the endpoint, or a Cloudflare
      WAF rate-limiting rule on `/api/signup` — that one needs no deploy at all.

---

## Security — open since the first review, never fixed

These are real and unaddressed. The captcha machinery to fix the first one already exists
in `src/server/captcha.ts`.

- [ ] **`POST /api/feedback` is unprotected.** Unauthenticated, wildcard CORS, no captcha,
      no rate limit. Rows land with `approved = 0` so nothing renders publicly, but the
      moderation queue will drown. Reuse `verifyCaptcha`, or rate limit by IP.
- [ ] **`GET /api/subdomain/check` has no rate limit and no caching.** One D1 read per
      request, which is a fast oracle for enumerating every claimed slug. Slugs are public
      DNS names so the information is not secret, but the free bulk enumeration is
      avoidable — cache the negative answer for 60s at minimum.
- [ ] **`RESERVED_HOST_LABELS` and `RESERVED_SLUGS` are two hand-maintained lists.**
      `worker.ts` and `shared/slug.ts` respectively. They overlap but neither derives from
      the other, so drift means somebody claims a slug that can never route to them.
      Derive the host set from `RESERVED_SLUGS`, or assert one is a subset of the other.
- [ ] **Image uploads have no rate limit.** `POST /api/business/photo` and
      `POST /api/staff/<id>/photo` need `business:write` / `staff:write`, so only an
      authenticated owner can reach them — but an owner can replace a logo in a loop and
      each call writes a 512 KB row. Bounded by `INSERT OR REPLACE` on a unique key, so it
      cannot grow the table; it can still burn D1 writes.

---

## Product / polish

- [ ] **KPI card labels are hardcoded Russian in the worker.** `getCrmPayload` builds
      `label: "Записи на сегодня"` and similar, and the UI renders them verbatim — so an
      Uzbek or English owner reads Russian on their dashboard. This is the third instance
      of that pattern; the booking links and staff roles were fixed the same way, by
      returning an i18n KEY instead of copy. Harder here because the hints interpolate
      values ("3 уже пришли", "12 сотрудников · 5 услуг"), so it needs parameterised
      strings rather than a straight key swap.
- [ ] **Removing the easyQ footer wordmark** from the public booking page. Deliberately
      not built: whether a business can white-label is a pricing decision. The plumbing is
      one boolean if you decide it belongs in a tier. Note the CRM sidebar and the booking
      page header already show the business's own logo, so this is the last easyQ mark a
      customer sees.
- [ ] **`service_only` assigns the first eligible specialist, not the least busy.** Anything
      smarter is a scheduling policy, and a shop that turned the step off has said it does
      not care who by. If load-balancing is wanted it is a real feature: it needs to consider
      shifts and existing bookings, not just pick from a list.

---

## Known limits — decided, not bugs

Documented so nobody re-discovers them as defects.

- **The Telegram bots can still double-book.** Availability is duration-aware in the CRM
  and on the web booking page, but the bots compute their own availability in
  `easyqueue-business-bot` and still compare start times only. A bot booking can overlap a
  web one. Closing it means changing the bots.
- **A bot booking will not merge with a web booking by the same person.** Clients are keyed
  on `client_phone`, and the bots do not populate that column, so they fall back to
  `user_id`. The same human appears twice in Customers. Also needs the bots.
- **Changing a password does not end that person's other sessions instantly on every
  edge** — it does, via `session_version`, but only as their cookie is next checked. There
  is no server-side session list to enumerate.
- **A service with no specialist assigned is not bookable.** It is dropped from the public
  page rather than offered to the whole team. The old fallback meant one specialist assigned
  to one service appeared on every service in the shop.
- **Image uploads are not virus-scanned.** No engine inspects a genuine PNG for a payload,
  and a Worker has none to call. What is guaranteed instead: byte-level format sniffing, SVG
  refused, a browser-side decode/re-encode that means stored bytes are the browser's own
  encoder output, and `nosniff` on every response. Real scanning needs an external service.
- **Stored images are capped at 512 KB and 512px.** The browser downscales, so this is
  invisible in normal use. A caller that skips the downscale gets a 413.
- **A specialist's client rows carry no money.** `spentTotal` is 0 and `favoriteStaff` is
  "—" by design, so the Customers screen swaps those two columns for last visit and
  upcoming when a specialist is signed in.

---

## Telegram signup verification — SHIPPED 2026-07-30

The `1111` code is gone. A visitor opens a deep link into **@easyqueue_business_bot**, presses
Start and taps "share my number"; Telegram vouches for the number and the bot writes it to
`signup_verification`. There is no code to send, intercept or mistype.

The long-standing blocker — a bot has one webhook and this one's already points at
`easyqueue-business-bot` — turned out to be the wrong problem to solve. All three Workers bind
the same D1, so the bot writes the row directly and the CRM reads it: no second bot, no webhook
to repoint, no HTTP between services, no shared secret.

Handler: `easyqueue-business-bot/src/handlers/signup.handler.ts`. That repo now deploys from CI
like this one.

**Signup records the real `telegram_id`.** Web signups used to get a synthetic negative id, so
the business existed for the CRM and not for the bots — the same root cause as the logo upload
that silently failed for months. An existing `users` row for that account is reused, since the
column is UNIQUE.

`VERIFY_BOT_TOKEN`, `VERIFY_BOT_USERNAME` and `VERIFY_WEBHOOK_SECRET` are no longer read by the
verification flow, and `/api/telegram/verify-webhook` is dead code kept only until someone
confirms nothing else calls it.

---

## Working on this repo

### Deploying

Push to `main` → GitHub Actions builds and deploys the Worker. CI runs `tsc --noEmit` before
building; `vite build` alone strips types without resolving them, so a type error used to
deploy green.

### Migrations — the rule that matters

**Migrate first, deploy second.** Additive columns are invisible to the running code, so
there is never a reason to do it the other way round. Deploying first takes the CRM down:
`getBusinessById` runs on every authenticated request, so one missing column 500s everything.

**Verify the column exists before pushing. A report that the migration ran is not
evidence.** This cost a login outage on 2026-07-28 — the SQL looked like it ran and had
not. The D1 console aborts a multi-statement batch on the first error, so a
`duplicate column name` on an already-applied statement silently skips everything after
it while still looking like one failed query. Run new statements **one at a time**, then:

```sql
SELECT name FROM pragma_table_info('businesses') WHERE name = '<column>';
```

A `duplicate column name` error is itself proof that column exists — you cannot duplicate
what is not there. That is a pass, not a failure.

Where a deployed endpoint already touches the column, probe production instead — a bogus
login is the best single check, because it queries `businesses` and then falls through to
`staff`:

```
curl -X POST https://barber.easyq.uz/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"probe","password":"x"}'
```

`401` with JSON means the schema is fine. `500` with `no such column` means stop.

**Where a new table is optional, make the read tolerant instead.** `crm_images` is queried
inside `getCrmPayload`, so a missing table would 500 the whole CRM — that query catches and
reports "no images", which costs photos and nothing else. Upload and serve deliberately do
not: they are user-initiated, and failing silently there would look like it worked.

### Confirming a deploy landed

Cloudflare rolls a Worker out gradually across edge locations, so **a single probe lies**.
Mid-rollout you will get a mix of old and new responses. Poll for a run of consistent
answers — a dozen — before believing it. Pick a discriminator the old code cannot produce:
a new route returning 401 instead of 404, or a new field appearing in a payload.

This is not theoretical. On 2026-07-30 a watcher on `/api/public/business` saw the new
payload shape twice, then the OLD shape again, twice, before it settled. One check would
have reported success three separate times while the rollout was still in progress.

### Types are not evidence either

`serveStoredImage` annotated a D1 blob column as `ArrayBuffer`. D1 returns a blob as an
**array of integers**, so the annotation was a claim, not a check — it type-checked cleanly
and served bytes that were not an image. When a value crosses a boundary the compiler cannot
see (a DB driver, `JSON.parse`, a request body), the type is a comment. Narrow it at runtime.

### Local development

`npm ci` fails on the dev machine with `ERR_SSL_CIPHER_OPERATION_FAILED`, so there is no
local `node_modules` and `wrangler` cannot run locally. Consequences:

- Migrations are applied through the **Cloudflare dashboard D1 console**: dash.cloudflare.com
  → Storage & Databases → D1 SQL Database → `easyqueue_db` → Console.
- Typechecking borrows TypeScript from a sibling repo plus a stub for
  `@cloudflare/workers-types`. It covers all of `src`, but `react-dom/client` does not
  resolve — that one error is expected locally and does not appear in CI.
- There is no local build or dev server, so **CI is the first real build** of any change.

---

## Migrations applied to production

All in `migrations/`.

| File | Adds | Applied |
| --- | --- | --- |
| `2026-07-28-crm-owned-tables.sql` | `captcha_used`, `landing_feedback`, `businesses.slug` | yes |
| `2026-07-28-booking-client-phone.sql` | `bookings.client_phone` | yes |
| `2026-07-28-staff-role-phone.sql` | `staff.role`, `staff.phone` | yes |
| `2026-07-28-staff-access.sql` | staff login columns + username index | yes |
| `2026-07-28-session-version.sql` | `session_version` on `businesses` and `staff` | yes |
| `2026-07-28-brand-color.sql` | `businesses.brand_color` | yes |
| `2026-07-28-brand-theme.sql` | `businesses.brand_theme` | yes |
| `2026-07-30-booking-flow-and-staff-photo.sql` | `businesses.booking_flow`, `staff.photo_file_id`, `staff.photo_file_unique_id` | yes |
| `2026-07-30-crm-images.sql` | `crm_images` table + index | yes |
| `2026-07-28-signup-verification.sql` | `signup_verification` | yes — 2026-07-30 |
