# EasyQ CRM — outstanding work

Last updated 2026-08-03. Everything below is either not started or waiting on someone.
Items are ordered within each section by what I'd do first.

---

## Needs a person, not code

Nothing here can be done from the repo.

- [ ] **Set the two webhook secrets. Until this is done, the bots accept forged updates.**
      The check shipped on 2026-08-03 but is INERT while `TELEGRAM_WEBHOOK_SECRET` is unset —
      deliberately, because enforcing it before Telegram sends the header would take both bots
      down. Every update logs `WEBHOOK IS UNAUTHENTICATED` until you finish. Steps and the
      reasoning are in each bot's README under *Telegram Webhook*; do it for
      `easyqueue-business-bot` and `easyqueue-client-bot`, with a different secret each.
- [ ] **Apply `migrations/2026-08-03-rate-limit.sql`. Until this is done, there is no rate
      limiting.** Same shape of problem: the limiter fails open so that pushing to `main`
      cannot deploy ahead of the SQL, which means it does nothing until the table exists.
      Every limited request logs `RATE LIMITING IS OFF` until then.

      ```
      npm run db:migrate:remote:rate-limit
      ```

      Then confirm it took, per the migration rule below:

      ```sql
      SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limit';
      ```
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

## Security — reviewed 2026-08-03, mostly closed

A full pass over auth, permissions, SQL, CORS, uploads and both bots. What it found and what
is left.

**Closed.** Bot webhooks now require Telegram's `secret_token` — they previously accepted any
POST from anyone, which was a sign-up verification bypass, not merely spam, because
`contactBelongsToSender` compares two fields a forger controls. Rate limiting now exists at all
(`src/server/rateLimit.ts`) and covers login, sign-up, feedback, subdomain checks, public
bookings and verification starts. Money redaction moved onto `payment:write` rather than the
role name. `isScopedToOwnBookings` fails closed. Session HMACs are compared timing-safely,
PBKDF2 is at 600k, and an unknown username burns a decoy hash so timing no longer answers
"does this account exist".

**Verified clean, so nobody re-checks it:** no SQL injection anywhere (both dynamic `IN` lists
build placeholders from the array length and bind the values); wildcard CORS is safe because no
endpoint sets `Allow-Credentials` and the cookie is `SameSite=Lax`; tenant binding, per-request
staff re-reads and `session_version` eviction all hold; the upload hardening matches what the
README claims; no secrets in the git history of the two public repos.

Still open:

- [ ] **`RESERVED_HOST_LABELS` and `RESERVED_SLUGS` are two hand-maintained lists.**
      `worker.ts` and `shared/slug.ts` respectively. They overlap but neither derives from
      the other, so drift means somebody claims a slug that can never route to them.
      Derive the host set from `RESERVED_SLUGS`, or assert one is a subset of the other.
- [ ] **Image uploads have no rate limit.** `POST /api/business/photo` and
      `POST /api/staff/<id>/photo` need `business:write` / `staff:write`, so only an
      authenticated owner can reach them — but an owner can replace a logo in a loop and
      each call writes a 512 KB row. Bounded by `INSERT OR REPLACE` on a unique key, so it
      cannot grow the table; it can still burn D1 writes. The limiter now exists, so this is
      one call to `requireUnderRateLimit` whenever it is judged worth the write.
- [ ] **`crm_temp_password` is stored in plaintext** and persists until the person first
      changes their password — which may be never. It is cleared on change and on revoke, and
      the owner has to be able to read it out to the staff member, so the alternative is
      showing it once at issue and never again. Worth deciding: both bots bind the same D1.

---

## Phone numbers — any country, SHIPPED 2026-08-01

`src/shared/phone.ts` runs on `libphonenumber-js`, and every input on the platform now takes
any country and works out which one from the prefix: `+998` → 🇺🇿, `+7` → 🇷🇺 or 🇰🇿, `+1` → 🇺🇸.
Three inputs share the behaviour — `PhoneInput` (`src/crm/ui.tsx`), `PhoneField`
(`src/booking/BookingApp.tsx`), `SUPhoneInput` (`easyq-landing/src/components/Signup.tsx`).

Three things worth not re-litigating:

- **No dropdown.** The country is inferred, never picked first. A picker in front of the field
  is a step for everybody to serve the minority who are not local.
- **No flag until the prefix decides.** `+7` is Russia *and* Kazakhstan; the library commits
  only once a digit separates them (Kazakh mobiles start 6 or 7, Russian ones 9). Until then
  the field shows a globe. Showing one of the two would be a guess presented as a fact.
- **`+998 ` is the placeholder, not the value.** As a hardcoded prefix it would have to be
  deleted before anyone could type another country's code — which is the exact bug being fixed.

Caret position is restored by **digit count**, not character index, or it drifts a place every
time a reformat moves a space. That logic is duplicated in all three inputs; if a fourth
appears, extract it.

`SUPhoneInput` was dead for a while — the landing's phone step became pure contact-sharing and
nothing typed a number any more. It is back in use: the step now asks for the number first.

### Flags are drawn, not emoji — `src/shared/CountryFlag.tsx`

The first version used `String.fromCodePoint` over regional-indicator letters, which gives a
flag for any country in one line and no assets. **Windows does not render flag emoji at all** —
every version through 11 draws the two letters in a box — so most desktop visitors saw "UZ" in
a rectangle where the design said flag, looking like a broken glyph. Android and iOS do render
them, which is exactly what makes it easy to ship without noticing.

So the fourteen countries in `PHONE_COUNTRIES` are drawn as inline SVG, and **everything else
falls back to the globe** — the same one shown while a prefix is still ambiguous. That is not a
gap to fill: there are ~250 flags and no honest way to inline them all. Emblem-heavy ones (the
Kazakh eagle, the Korean trigrams, the American stars) are simplified to what reads at 18px.

Same rule now applies across both sites: **no emoji in UI chrome.** Ticks, stars and the icons
that were in the broadcast-template labels are SVG or gone. Emoji inside Telegram messages stay
— that is Telegram's own medium, and a bot message cannot hold an SVG.

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
- **One visit is one specialist.** A basket is only offered to staff who can perform EVERY
  service in it, so a shop that splits a visit between two people cannot express that here.
- **Two hours is the ceiling on one basket.** Past that it stops being an appointment and
  becomes a block of somebody's afternoon booked by a stranger who may not turn up. Services
  that would breach it are dimmed rather than hidden. The server caps at eight lines for the
  same reason.
- **A basket that will not resolve gets no slots at all**, rather than slots sized to the
  services that did resolve — offering times the booking then refuses reads as the shop losing
  the slot between two screens.
- **Tier pricing is separate services, not a price matrix.** "Haircut - Barber" and
  "Haircut - Chief Barber" are two rows linked to different staff, which is what Altegio does
  and what the data already supported. The cost is upkeep for the owner: two rows to edit
  instead of one service with two prices.
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

### The step asks for the number first — 2026-08-01

It used to go straight to "open the bot", and on success it rendered a confirmation card and
**stopped**: an auto-advance was supposed to move to the business step 900ms later, but
`setState('done')` re-ran the polling effect, whose cleanup set the `stop` flag before the timer
fired. So it never advanced. Every web signup dead-ended on a green tick. Now there is an
explicit **Continue registration** button, which cannot silently fail the same way and lets the
visitor actually read what was confirmed.

The step also asks for the number before sending anyone to Telegram, and the nonce is not issued
until then — it lives 15 minutes, and starting that clock while somebody is still typing spent it
on nothing.

**The bot's confirmation carries a link back.** "Go back to the website" assumed they still had
the tab, remembered the site, and were on the same device — usually none of that holds, because
they just opened Telegram on a phone. The confirmation now has a "continue registration" button
pointing at `easyq.uz/signup?v=<nonce>`, and the nonce is what makes it RESUME instead of
restart: the page polls with it and lands straight on the confirmed step. Safe in a URL — the
nonce is single-use, 15-minute, and holding it is already what authorises seeing the number.

Reading that parameter is done in a **pure** `useState` initializer, with the strip in an
effect. Doing both in the initializer looked tidier and silently broke the link: StrictMode
invokes initializers twice, so the first call cleared the URL and the second read nothing.

- [ ] **The typed number is not enforced against the confirmed one.** They are compared in the
      browser and a mismatch is explained, but nothing rejects it, because the confirmed number
      is the one that gets used either way — this is messaging, not a control. Enforcing it
      properly means a `claimed_phone` column, `/api/verify/start` storing it, and
      `easyqueue-business-bot` refusing to mark a row verified when the shared contact differs.
      Worth doing only if you want "you must sign up with the number you typed" to be a rule;
      note it would strand anyone whose Telegram lives on a second SIM.

---

## Booking widget — partly built

Rebuilt against the Altegio reference. A hub of full screens rather than one scrolling form,
and the step ORDER follows whichever row the customer tapped:

  from "choose specialist"   ->  specialist, services, time
  from "choose date & time"  ->  time, services, specialist
  from "choose services"     ->  services, specialist, time

Working: multi-service baskets with a running total, availability sized to the whole basket,
the selection mirrored in the URL (`?m12&s3&s7&d202607311430`) and rebuilt on load, category
chips and search, the two-tab specialist step, month calendar, times grouped by part of day.

**Not built yet** — none of it blocked, all of it visible to a customer:

- [ ] **Auto-select the nearest available day** on the date step, and disable months with no
      availability. Today it opens on the current month with nothing chosen.
- [ ] **Today / Tomorrow labels** on the quick-pick pills. They currently show only a time, so
      a pill on a specialist card does not say which day it belongs to.
- [ ] **Ratings and review counts on specialist cards.** The schema is applied; nothing
      collects, moderates or reads reviews yet. See the section below.
- [x] ~~**The CRM read side for multi-service.**~~ Done 2026-08-03. `booking_services` had zero
      read sites — the lines were written and never looked at, so a two-service booking showed
      as "Haircut +1" everywhere and the second service was invisible to the person who had to
      perform it. The booking detail now itemises every line with its own price and duration;
      compact rows keep a summary but DERIVE it via `serviceSummary`, so the count is right
      whether the row came from the booking page, a bot, or predates multi-service. A booking
      with no lines falls back to a single line built from the `bookings` columns, which is
      what both bots still write.

---

## Reviews — schema applied, nothing built

`reviews` was already in the shared database, created by easyqueue-business-bot. It has been
EXTENDED rather than replaced, because both bots query it by column name and deploy from their
own repos.

- [ ] **Collect them.** `bookings.review_token` exists and is unused. A post-visit link
      carrying that token is what makes a review provable — one visit, one review, and the
      review knows which specialist it is about because the booking does.
- [ ] **Moderate them.** `approved` defaults to 0 and the CRM's Reviews screen is still mock
      data. Nothing should render publicly until an owner approves it.
- [ ] **Per-staff averages** on the public payload, for the stars the booking page wants.
- [x] ~~**Fix both bots first.**~~ Done 2026-08-03. Every review query now filters
      `AND approved = 1`. It was THREE sites, not the two recorded here — this entry missed
      `easyqueue-client-bot/src/services/business.service.ts`, which would have kept publishing
      unmoderated text from the business card while the other two were fixed.

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
| `2026-07-31-service-category.sql` | `services.category` | yes |
| `2026-07-31-booking-services.sql` | `booking_services` table + backfill | yes |
| `2026-07-31-reviews.sql` | extends the EXISTING `reviews` table; `bookings.review_token` | yes |
