# EasyQ CRM — outstanding work

Last updated 2026-07-28. Everything below is either not started or waiting on someone.
Items are ordered within each section by what I'd do first.

---

## Needs a person, not code

Nothing here can be done from the repo.

- [ ] **Apply `2026-07-28-brand-theme.sql` before the branding page deploys.** One additive
      column, `businesses.brand_theme`. Migrate first, deploy second — `getBusinessById`
      selects the column on every authenticated request, so deploying first 500s the whole
      CRM. Verify with
      `SELECT name FROM pragma_table_info('businesses') WHERE name = 'brand_theme';`
      before pushing, not the console's report that it ran.
- [ ] **Delete two test bookings** on `barber.easyq.uz`, both Thu 30 Jul:
      `11:00 — TEST - please delete` and `09:00 — Outage probe`. They are holding real
      slots in Jorabek's calendar.
- [ ] **Try a staff login end to end.** Settings → Team & access, or open a staff member
      and set *CRM access*. Grant Specialist, then sign in with the issued credentials in a
      private window. Confirm the specialist sees only their own day: no money, no client
      list, no other staff. This is the one path that cannot be tested without a login.
- [ ] **Give `barber777` a roster.** It has staff but no weekly slots, so its booking page
      will always read "No free times". Jadval → the staff member → set hours.
- [ ] **Spot-check the branding page.** Settings → Branding, once
      `2026-07-28-brand-theme.sql` is applied. Pick **Midnight**, save, and open the public
      booking page: the whole page should be dark, not a dark button on a white page. Then
      set a custom background of `#ffffff` with text `#f5f5f5` — Save must be disabled and
      the contrast strip must read about 1.1:1. Button text is derived, so `#ffff00` should
      come out black and `#111827` white. If any of that is wrong the derivation in
      `src/shared/brand.ts` is at fault.

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
      one boolean if you decide it belongs in a tier.

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
- **Specialists cannot create bookings.** `booking:create` is owner and manager only:
  taking a booking means choosing whose day it lands on.

---

## Parked: Telegram signup verification

Branch **`telegram-otp`**, pushed in *both* `easyq-crm` and `easyq-landing`, not merged.
Replaces the hard-coded `"1111"` signup code with Telegram contact sharing — the visitor
taps a deep link and shares their number, so there is no code to intercept.

`main` still has the `1111` bypass, so production is unaffected until this merges.

> **The missing import is FIXED** (commit `06e9205`). `worker.ts` had no import for
> `./server/verification` while calling twelve of its names; `tsc --noEmit` now reports 0
> errors. The warning that this blocked deploys was half right — it never blocked them,
> because `npm run deploy` had no typecheck and bypassed CI entirely. That is also fixed:
> `deploy` now runs `tsc --noEmit` first, and `typecheck` no longer secretly builds.
>
> Production was running the merged code the whole time. `/api/verify/start` answered 503
> only because the token check runs before `generateNonce()` — setting the secret would
> have turned that into a ReferenceError. Safe to proceed now.

To resume, in this order:

1. Create a bot with [@BotFather](https://t.me/BotFather), e.g. `easyq_verify_bot`.
   It must be a **new** bot — a bot has one webhook, and reusing the business bot's would
   take its updates away from the bot service that owns it.
2. `npx wrangler secret put VERIFY_BOT_TOKEN`
3. `npx wrangler secret put VERIFY_WEBHOOK_SECRET` (any random string you invent)
4. `npm run db:migrate:remote:verification`
5. Register the webhook:
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://crm.easyq.uz/api/telegram/verify-webhook" \
     -d "secret_token=<SECRET>"
   ```
6. Merge both branches.

**Merging before steps 2–5 makes web signup return 503.** See the header comment in
`src/server/verification.ts` for why a bot cannot simply message a phone number.

---

## Working on this repo

### Deploying

Push to `main` → GitHub Actions builds and deploys the Worker. CI now runs
`tsc --noEmit` before building; `vite build` alone strips types without checking them, so
a type error used to deploy green.

### Migrations — the rule that matters

**Migrate first, deploy second.** Additive columns are invisible to the running code, so
there is never a reason to do it the other way round. Deploying first takes the CRM down:
`getBusinessById` runs on every authenticated request, so one missing column 500s
everything.

**Verify the column exists before pushing. A report that the migration ran is not
evidence.** This cost a login outage on 2026-07-28 — the SQL looked like it ran and had
not. The D1 console aborts a multi-statement batch on the first error, so a
`duplicate column name` on an already-applied statement silently skips everything after
it while still looking like one failed query. Run new statements **one at a time**, then:

```sql
SELECT name FROM pragma_table_info('businesses') WHERE name = '<column>';
```

Where a deployed endpoint already touches the column, probe production instead — a bogus
login is the best single check, because it queries `businesses` and then falls through to
`staff`:

```
curl -X POST https://barber.easyq.uz/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"probe","password":"x"}'
```

`401` with JSON means the schema is fine. `500` with `no such column` means stop.

### Confirming a deploy landed

Cloudflare rolls a Worker out gradually across edge locations, so **a single probe lies**.
Mid-rollout you will get a mix of old and new responses. Poll for a run of consistent
answers — a dozen — before believing it. Pick a discriminator the old code cannot produce:
a new route returning 401 instead of 404, or a new field appearing in a payload.

### Local development

`npm ci` currently fails on the dev machine with `ERR_SSL_CIPHER_OPERATION_FAILED`, so
there is no local `node_modules` and `wrangler` cannot be run locally. Migrations are
being applied through the Cloudflare dashboard D1 console instead. CI installs fine.

---

## Migrations applied to production

All in `migrations/`, all applied as of 2026-07-28:

| File | Adds |
| --- | --- |
| `2026-07-28-crm-owned-tables.sql` | `captcha_used`, `landing_feedback`, `businesses.slug` |
| `2026-07-28-booking-client-phone.sql` | `bookings.client_phone` |
| `2026-07-28-staff-role-phone.sql` | `staff.role`, `staff.phone` |
| `2026-07-28-staff-access.sql` | staff login columns + username index |
| `2026-07-28-session-version.sql` | `session_version` on `businesses` and `staff` |
| `2026-07-28-brand-color.sql` | `businesses.brand_color` |
| `2026-07-28-brand-theme.sql` | `businesses.brand_theme` — **not applied yet** |
| `2026-07-28-signup-verification.sql` | **not applied** — belongs to the `telegram-otp` branch |
