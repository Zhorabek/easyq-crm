# EasyQ CRM — outstanding work

Last updated 2026-08-06. Everything below is either not started or waiting on someone.
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

      **Order matters.** Call `setWebhook` with the new `secret_token` FIRST, then
      `wrangler secret put TELEGRAM_WEBHOOK_SECRET`. The other way round rejects every real
      update in the gap between the two.
- [ ] **Rotate `@easyqueue_business_bot`'s token.** It was pasted in plaintext in a chat on
      2026-07-28 and must be treated as compromised. `/revoke` with
      [@BotFather](https://t.me/BotFather). Logos no longer depend on it, but the two bots do.
      It has never been in the source tree; if it is set as a Worker secret, replace that too.
- [ ] **Clear the E2E test data out of `barber777`.** Left behind by the 2026-08-04 run-through
      and visible to anyone opening that shop's CRM: client `Mijoz Sinov`, a pending booking on
      5 Aug 10:00, a confirmed booking today 17:30, a 1 so'm payment on the cash desk, and an
      edited business description. `jora` was merged into `Sardor Testov` by phone — that one is
      the phone-keyed merge working, not damage.
- [ ] **Delete one orphaned row:** `DELETE FROM users WHERE id = 1604;` — left behind when
      the `zz-probe-not-real` business was removed.

---

## Security — captcha is currently OFF

- [ ] **Turn the signup captcha back on when the client is ready.** Off at their request
      (commit `22b0984`). Flip `SIGNUP_CAPTCHA_ENABLED` to `true` in **both**
      `easyq-crm/src/worker.ts` and `easyq-landing/src/components/Signup.tsx` — they must
      agree, or submit either always fails or shows pointless friction. Nothing else needs
      changing; the module, table, endpoint, field and strings are all still in place.

      While it is off, `POST /api/signup` writes a `users` row and a `businesses` row per
      call. It is no longer unauthenticated-and-unbounded — `LIMITS.signup` caps it at 5 per
      IP per hour since 2026-08-03 — but a captcha is the thing that distinguishes a person
      from a script, and a rate limit only slows one down. A Cloudflare WAF rule on
      `/api/signup` is the stopgap that needs no deploy at all.

---

## Security — reviewed 2026-08-03, 2026-08-04 and 2026-08-06

Three full passes over auth, permissions, SQL, CORS, uploads, headers and both bots. What they
found, and what is left.

**Closed on 2026-08-03.** Bot webhooks now require Telegram's `secret_token` — they previously
accepted any POST from anyone, which was a sign-up verification bypass, not merely spam, because
`contactBelongsToSender` compares two fields a forger controls. Rate limiting now exists at all
(`src/server/rateLimit.ts`). Money redaction moved onto `payment:write` rather than the role
name. `isScopedToOwnBookings` fails closed. Session HMACs are compared timing-safely, and an
unknown username burns a decoy hash so timing no longer answers "does this account exist".

**Closed on 2026-08-04:**

- **A second login door had no throttle.** `/api/auth/login` was rate limited and
  `/api/auth/session-login` was not, so the limit only decided which URL an attacker would use.
  Both now take `loginPerIp` and `loginPerUser`, and both burn a decoy hash on an unknown
  username. `scripts/security-check.cjs` now enumerates every block that verifies a password
  and asserts the throttle on each, so a third door cannot ship without one.
- **Plaintext temp passwords are gone.** `crm_temp_password` held a readable password for every
  business and every staff member indefinitely — read access to the database was login access
  to every account, and both bots bind the same D1. Replaced by
  `crm_temp_password_pending`, one bit: the password is shown once at the moment it is
  generated and never stored. `migrations/2026-08-04-temp-password-flag.sql`, applied.
- **The cash desk leaked to specialists.** `paymentsToday` was added to the payload that
  morning and not to the `payment:write` gate, so a specialist received the amount, method and
  customer name of every payment the shop took that day. The check now derives the field list
  from the payload itself rather than from a hand-written list, which is what would have caught
  it.
- **Image uploads are bounded.** `LIMITS.imageUpload`, 40 per hour, keyed **per business** — an
  authenticated owner could otherwise replace a logo in a loop and burn D1 writes 512 KB at a
  time.
- **Security headers on every response.** `withSecurityHeaders` wraps the router's output rather
  than being applied per route, so a new route cannot ship without them: `nosniff`,
  `strict-origin-when-cross-origin`, `base-uri 'self'`, and `frame-ancestors` /
  `form-action` as allowlists.

  `form-action` is an allowlist and **not `'self'`** — that is not a weaker policy, it is the
  only correct one. The login flow posts credentials cross-origin to
  `<slug>.easyq.uz/api/auth/session-login` so the tenant host sets its own cookie, and
  `'self'` silently blocked it: no redirect, and a login page that appeared to do nothing.
  A CSP that forbids something the app does is a broken feature, not a stricter policy.

**Closed on 2026-08-06 — the third money leak, and the widest.**

`booking.payment` hangs off every booking card and every line of a client's visit history:
incoming, outgoing, net, remaining, status, and an itemised history with amounts and methods. The
`payment:write` gate blanked the KPI strip, the cash desk, the analytics block and the per-employee
revenue, and never touched this one. A specialist's `/api/crm` therefore carried, for every booking
on their calendar and every visit of a shared client, what that customer paid and what they still
owe.

Three leaks, one shape: **the gate lists money that is its own field and misses money that travels
as a property of something else.** Nothing renders any of it, which is what let this survive — the
specialist screens show no money at all, so from the outside the role looks clean. It was found by
fetching a real specialist's payload in their own session and grepping the JSON for a non-zero
amount. **Read the payload, not the screen.**

Two follow-on lessons worth more than the fix:

- **Redaction alone can make things worse.** Blanking the data left the booking modal rendering
  "0 so'm paid, 0 outstanding" for a customer who had paid in full — a confident false statement a
  specialist could repeat to that customer. The modals now hide money outright for roles without
  `payment:write`. Absent beats wrong.
- **The check I wrote first was decorative: it passed on broken code.** Each field accepted any of
  three patterns and one of them matched a different field regardless, so deleting a whole line of
  redaction left all 73 checks green. Rewritten as one exact call per collection, then verified by
  deleting each line in turn and confirming the matching assertion fails. **A check proves nothing
  until you have watched it fail.**

**Verified clean, so nobody re-checks it:** no SQL injection anywhere — `scripts/sql-bind-check.cjs`
walks all 94 prepare/bind pairs and the only interpolations are generated placeholder lists and
the two image-store table constants; wildcard CORS is safe because no endpoint sets
`Allow-Credentials` and the cookie is `SameSite=Lax`; tenant binding, per-request staff re-reads
and `session_version` eviction all hold; the upload hardening matches what the README claims; no
secrets in the git history of the two public repos; `outreach/session.txt`, `outreach/.env` and
`outreach/state.json` are gitignored and untracked, which matters because this repo is public
and that session string **is** the Telegram login.

Still open:

- [ ] **`RESERVED_HOST_LABELS` and `RESERVED_SLUGS` are two hand-maintained lists.**
      `worker.ts` and `shared/slug.ts` respectively. They overlap but neither derives from
      the other, so drift means somebody claims a slug that can never route to them.
      Derive the host set from `RESERVED_SLUGS`, or assert one is a subset of the other.
- [ ] **`/api/telegram/verify-webhook` is dead code.** Nothing calls it since verification moved
      to the shared D1 on 2026-07-30. It is kept only until someone confirms that; delete it,
      along with `VERIFY_BOT_TOKEN`, `VERIFY_BOT_USERNAME` and `VERIFY_WEBHOOK_SECRET`.

### PBKDF2 is at 100k, and cannot go higher

Worth writing down because it looks like a number somebody forgot to raise. It was set to 600k
(the OWASP figure) and **Cloudflare refuses it** — the Workers runtime caps PBKDF2 iterations,
and every login 500s above the ceiling. 100k is the most that runs. See the note on
`PBKDF2_ITERATIONS` in `src/server/auth.ts`; raising it needs a different KDF, not a bigger
constant.

That is also why login is rate limited **before** the hash rather than after: those iterations
are the cost being defended.

---

## Mobile — reviewed 2026-08-06, both surfaces and all three roles

Audited at 320 / 375 / 414: the CRM as owner, manager and specialist, the public booking page, and
the landing including its sign-up wizard. Everything found is fixed; recorded here so nobody
re-derives it.

**What held up.** The CRM's mobile layout was better than expected — the sidebar is a proper
off-canvas drawer and every wide surface (day calendar, customers table, services list) sits in an
`overflow-x: auto` wrapper, so **zero content is clipped-and-unreachable on any screen for any
role**. That distinction is the audit: "off-screen" and "inside a scroller" are identical in a
screenshot, and the only way to tell them apart is to walk each overflowing element's ancestors
looking for one that can actually scroll to reveal it.

**What did not.**

- **iOS zoomed the page on every login, and on the landing's sign-up form.** Safari zooms when a
  focused input is under 16px; the CRM's were 14–14.5px and the landing's were 15px. One media
  query per repo on bare `input`/`textarea`/`select` with `!important`, because these sizes come
  from inline style objects and have no class to hook. Small screens only, so the desktop density
  is unchanged.
- **The landing's mobile menu could not be opened at all** below 376px. The language pills carried
  no class, so the breakpoint that hid the nav links and "Sign in" left 146px of pills in place and
  pushed `.nav-burger` to x=377 — outside a viewport whose ancestor is `overflow-x: clip`. It was
  painted off the page, and a hit test at its centre returned a plain div.
- **A phone had no route to the CRM login.** `.nav-signin` is hidden below 860px and the mobile
  menu only ever held the section links, so an existing customer opening easyq.uz on their phone
  could not reach their own login. **Hiding a control on a small screen is only correct if it
  reappears somewhere.**
- **Touch targets, in both repos.** Eleven footer links at 22px; the five feedback stars at 30px
  and 4px apart, on the one control whose job is recording which number you meant; the sign-up
  "Back" at 21px directly above a 52px primary CTA; the booking page's basket-edit at 24px beside
  a 54px "Confirm booking", where a miss books the appointment. Nothing in the CRM is under 36px
  now, and nothing on the landing under 38px.
- **Four separate copies of the language switcher** — header, mobile menu, footer, sign-up page —
  all at 28px. If a fifth appears, extract the component properly.
- **Three icon-only buttons had no accessible name**, including the burger that opens the entire
  CRM on a phone. Sign out had a `title` and no `aria-label`: a hover tooltip is unreliable to a
  screen reader and dead weight on a touch screen, where nothing hovers.

**The one to remember: breakpoints measure the viewport, the top bar does not.** It sits beside a
248px sidebar, so its real width is `viewport - 248` until the sidebar collapses at 820. Crowding
relief belongs at **1024** (`1024 - 248 = 776`, the width the old rule was tuned for). Getting it
wrong gave the page a horizontal scrollbar across 856–1024 with the search squeezed to 64px.

Two CSS traps from the same pass:

- **A `min-width` on a flex child is a floor it will not cross.** 150px on the search forced the
  bar wider than the window. If something must shrink, let it.
- **`minWidth: 0` can hide a bug rather than fix one.** The dashboard donut's legend had it, which
  promised the legend could shrink to nothing while its text refused to — so nothing wrapped and
  the card overflowed a 320px viewport.

- [ ] **Sign-up step 2 is unverified at 320px.** Business name, slug and category only render after
      a real Telegram verification, which needs a phone, so the layout of that one step was never
      measured. Its inputs are covered — the iOS fix is a bare `input` selector and cannot miss
      them — but the boxes around them are not. Worth a look during the next real sign-up.

---

## Product / polish

- [ ] **Today / Tomorrow labels on the booking page's quick-pick pills.** They show only a time,
      so a pill on a specialist card does not say which day it belongs to.
- [ ] **Removing the easyQ footer wordmark** from the public booking page. Deliberately
      not built: whether a business can white-label is a pricing decision. The plumbing is
      one boolean if you decide it belongs in a tier. Note the CRM sidebar and the booking
      page header already show the business's own logo, so this is the last easyQ mark a
      customer sees.
- [ ] **`service_only` assigns the first eligible specialist, not the least busy.** Anything
      smarter is a scheduling policy, and a shop that turned the step off has said it does
      not care who by. If load-balancing is wanted it is a real feature: it needs to consider
      shifts and existing bookings, not just pick from a list.
- [ ] **The tour and the Guide are two descriptions of the same product.** `TOUR_STEPS` in
      `src/crm/Tour.tsx` and `TOPICS` in `src/crm/Help.tsx` both enumerate the screens, both
      filter by role, and both have their own check script. That is fine while they say
      different things — the tour is nine steps of orientation, the Guide is twelve topics of
      detail — but if one grows into the other, merge them.

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
  to one service appeared on every service in the shop. The services table flags those rows
  in amber so an owner can see why one vanished.
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
- **The subscription has no payment gateway.** Choosing a plan opens a Telegram chat with a
  prefilled message; a person activates it with one `UPDATE`. Building billing before anyone
  has paid for a second month is building the wrong thing.
- **The notification bell caps at 50 pending bookings.** A shop that has ignored confirmations
  for a year should not have that year's backlog serialised into every payload.
- **There is no search on a phone.** `.crm-search` is `display: none` below 1024px: beside a 248px
  sidebar there is no room for a usable field, and a 64px one is a magnifying glass with nowhere to
  type. Everything else in the top bar survives, in the drawer.
- **A redacted number is not shown as a number.** Where a role may not see money the figure is
  dropped, not zeroed — a `0` is a confident statement that the customer paid nothing, which a
  specialist could repeat to them. Absent beats wrong, and it applies to any future redaction.
- **The guided tour and the Guide carry no screenshots.** Every screenshot taken before
  2026-08-04 would now be showing a product that does not exist, and nothing fails when a
  picture goes stale — it renders perfectly and lies. Each Guide topic carries a button to the
  live screen instead.

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

## Booking widget — the remaining gap is reviews

Rebuilt against the Altegio reference. A hub of full screens rather than one scrolling form,
and the step ORDER follows both the owner's `booking_flow` setting and whichever row the
customer tapped:

```
from "choose specialist"   ->  specialist, then the owner's order
from "choose date & time"  ->  time, then the owner's order
from "choose services"     ->  services, then the owner's order
```

`scripts/booking-order-check.cjs` asserts that, per flow and per entry point, because the
setting used to reorder the menu rows and nothing else — past the first tap every shop behaved
like `service_first`.

Working: multi-service baskets with a running total, availability sized to the whole basket,
the selection mirrored in the URL (`?m12&s3&s7&d202607311430`) and rebuilt on load, category
chips and search, the two-tab specialist step, month calendar, times grouped by part of day.

- [ ] **Ratings and review counts on specialist cards.** The schema is applied; nothing
      collects, moderates or reads reviews yet. See the section above.
- [x] ~~**Auto-select the nearest available day.**~~ Done 2026-08-04. The picker opened on
      today and, when today was full, said "no free time — try another day", leaving the
      customer to hunt by tapping dates one at a time. `GET /api/public/available-days` returns
      which of the next N days (clamped to 30) have room, computed with **the same
      `getPublicSlots`** the slot list uses, so "this day has room" cannot disagree with what
      the day then offers. Empty days are dimmed rather than hidden.
- [x] ~~**The CRM read side for multi-service.**~~ Done 2026-08-03. `booking_services` had zero
      read sites — the lines were written and never looked at, so a two-service booking showed
      as "Haircut +1" everywhere and the second service was invisible to the person who had to
      perform it. The booking detail now itemises every line with its own price and duration;
      compact rows keep a summary but DERIVE it via `serviceSummary`, so the count is right
      whether the row came from the booking page, a bot, or predates multi-service. A booking
      with no lines falls back to a single line built from the `bookings` columns, which is
      what both bots still write.

---

## Shipped, kept for the reasoning

### Subscriptions — 2026-08-04

Thirty days free from signup, then four tiers by team size. Three decisions worth not
re-litigating:

- **It fails open.** No `plan_expires_at`, or a date that will not parse, counts as active.
  Locking a paying shop out of its own calendar over a missing migration is worse than a free
  week.
- **Expiry blocks the CRM and nothing else.** The booking page and both bots keep working. The
  shop owes money; their customers do not, and a customer who cannot book books elsewhere —
  which costs the shop the money being asked for.
- **Never recommend below the featured tier.** `recommendPlan` floors at `p5` (299k) rather
  than picking the cheapest that fits, so a one-chair shop is offered the tier the business
  wants to sell rather than the 175k one. `src/shared/plans.ts` holds the prices and the rule;
  they are written down in exactly one other place, `outreach/lib/messages.mjs`, and the two
  must agree.

The request itself is a **prefilled Telegram draft** — `t.me/<manager>?text=<message>`, which is
documented for user links, not only bots — written in the owner's own language and naming their
plan, price, business and team size. The price is grouped `ru-RU` in all three languages so it
matches the card they just tapped.

### The guided tour and the Guide — 2026-08-04

Both are **role-aware**, and that is the whole point: the old tour told a specialist to add
services on a screen with no nav item, and promised access rights to people who cannot grant
them. Every tour step and every Guide topic declares the screen it is about; anything whose
screen the reader cannot open is not rendered, and steps that survive get different copy per
role (`copyKeyFor`). `scripts/tour-check.cjs` and `scripts/help-check.cjs` assert that for all
three roles — a specialist sees 6 of 9 tour steps and 5 of 12 Guide topics.

The Guide sits **below the working screens, next to Settings**: dashboard through Branding are
the shop's daily work, the manual is not.

### Phone numbers — any country, 2026-08-01

`src/shared/phone.ts` runs on `libphonenumber-js`, and every input on the platform takes any
country and works out which one from the prefix: `+998` → 🇺🇿, `+7` → 🇷🇺 or 🇰🇿, `+1` → 🇺🇸.
Three inputs share the behaviour — `PhoneInput` (`src/crm/ui.tsx`), `PhoneField`
(`src/booking/BookingApp.tsx`), `SUPhoneInput` (`easyq-landing/src/components/Signup.tsx`).

- **No dropdown.** The country is inferred, never picked first. A picker in front of the field
  is a step for everybody to serve the minority who are not local.
- **No flag until the prefix decides.** `+7` is Russia *and* Kazakhstan; the library commits
  only once a digit separates them (Kazakh mobiles start 6 or 7, Russian ones 9). Until then
  the field shows a globe. Showing one of the two would be a guess presented as a fact.
- **`+998 ` is seeded on focus, not hardcoded.** As a fixed prefix it would have to be deleted
  before anyone could type another country's code. As a placeholder alone it was worse: an
  empty field looked seeded, so people typed nine digits into nothing and a local number was
  parsed as a foreign one. Focus writes the real value; the field is still empty until then.

Caret position is restored by **digit count**, not character index, or it drifts a place every
time a reformat moves a space. That logic is duplicated in all three inputs; if a fourth
appears, extract it.

**Flags are drawn, not emoji** — `src/shared/CountryFlag.tsx`. The first version used
`String.fromCodePoint` over regional-indicator letters, which gives a flag for any country in
one line and no assets. **Windows does not render flag emoji at all** — every version through 11
draws the two letters in a box — so most desktop visitors saw "UZ" in a rectangle where the
design said flag. Android and iOS do render them, which is exactly what makes it easy to ship
without noticing. So the fourteen countries in `PHONE_COUNTRIES` are inline SVG and everything
else falls back to the globe; there are ~250 flags and no honest way to inline them all.

Same rule across both sites: **no emoji in UI chrome.** Emoji inside Telegram messages stay —
that is Telegram's own medium, and a bot message cannot hold an SVG.

### Telegram signup verification — 2026-07-30

The `1111` code is gone. A visitor opens a deep link into **@easyqueue_business_bot**, presses
Start and taps "share my number"; Telegram vouches for the number and the bot writes it to
`signup_verification`. There is no code to send, intercept or mistype.

The long-standing blocker — a bot has one webhook and this one's already points at
`easyqueue-business-bot` — turned out to be the wrong problem to solve. All three Workers bind
the same D1, so the bot writes the row directly and the CRM reads it: no second bot, no webhook
to repoint, no HTTP between services, no shared secret.

**Signup records the real `telegram_id`.** Web signups used to get a synthetic negative id, so
the business existed for the CRM and not for the bots — the same root cause as the logo upload
that silently failed for months.

The step asks for the number **before** sending anyone to Telegram, and the nonce is not issued
until then — it lives 15 minutes, and starting that clock while somebody is still typing spent
it on nothing. The bot's confirmation carries a link back to `easyq.uz/signup?v=<nonce>`, and
the nonce is what makes it RESUME instead of restart. Safe in a URL: single-use, 15-minute, and
holding it is already what authorises seeing the number. Reading that parameter is done in a
**pure** `useState` initializer with the strip in an effect — doing both in the initializer
looked tidier and silently broke the link, because StrictMode invokes initializers twice.

- [ ] **The typed number is not enforced against the confirmed one.** They are compared in the
      browser and a mismatch is explained, but nothing rejects it, because the confirmed number
      is the one that gets used either way — this is messaging, not a control. Enforcing it
      properly means a `claimed_phone` column, `/api/verify/start` storing it, and
      `easyqueue-business-bot` refusing to mark a row verified when the shared contact differs.
      Worth doing only if you want "you must sign up with the number you typed" to be a rule;
      note it would strand anyone whose Telegram lives on a second SIM.

---

## Working on this repo

### Deploying

Push to `main` → **Cloudflare's own Git integration** builds and deploys the Worker. Not GitHub
Actions; the Actions workflow is a typecheck gate that deploys nothing. Worth knowing, because
it went red for days without stopping a single deploy.

CI and `npm run deploy` both run `tsc --noEmit` first. `vite build` alone strips types without
resolving them, which is how a file calling twelve names it never imported once deployed green.

### The check scripts

Six of them, plain Node, no test runner and no dependencies:

```bash
node scripts/security-check.cjs
```

`security-check` (66), `sql-bind-check` (94), `tour-check` (111), `help-check` (147),
`booking-order-check` (44), `deeplink-check` (22). Every one exists because something in it
broke once. They assert against the **source**, and two of them had to be taught to strip
comments first — the comment explaining a fix contains the string the check was looking for,
so the check passed on the explanation rather than the code.

`sql-bind-check` is the one that earns its keep: a prepare/bind arity mismatch is invisible to
TypeScript, and replacing a `?` with a literal while leaving the bind argument in place is
exactly the kind of edit that gets made at speed.

`outreach/` has its own suite — `npm --prefix outreach test`, 114 checks.

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

```bash
curl -X POST https://barber.easyq.uz/api/auth/login -H 'content-type: application/json' -d '{"username":"probe","password":"x"}'
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

And pick a discriminator the **framework** cannot produce either: grepping the built bundle
for `createPortal` proved nothing, because `react-dom` exports it whether or not anything
calls it.

### Types are not evidence either

`serveStoredImage` annotated a D1 blob column as `ArrayBuffer`. D1 returns a blob as an
**array of integers**, so the annotation was a claim, not a check — it type-checked cleanly
and served bytes that were not an image. When a value crosses a boundary the compiler cannot
see (a DB driver, `JSON.parse`, a request body), the type is a comment. Narrow it at runtime.

### Local development

`npm ci` fails on the dev machine with `ERR_SSL_CIPHER_OPERATION_FAILED`, so **`wrangler`
cannot run locally**. Consequences:

- Migrations are applied through the **Cloudflare dashboard D1 console**: dash.cloudflare.com
  → Storage & Databases → D1 SQL Database → `easyqueue_db` → Console. The `db:migrate:*` npm
  scripts are there for a machine where wrangler works; they are not the path being used.
- Typechecking borrows TypeScript from a sibling repo plus a stub for
  `@cloudflare/workers-types`. It covers all of `src`, but `react-dom/client` does not
  resolve — that one error is expected locally and does not appear in CI.
- There is no local build or dev server, so **CI is the first real build** of any change.
- The check scripts run on plain Node with no install, which is why they are `.cjs` and
  dependency-free.

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
| `2026-08-03-rate-limit.sql` | `rate_limit` table + window index | yes — 2026-08-04 |
| `2026-08-04-subscriptions.sql` | `businesses.plan`, `plan_started_at`, `plan_expires_at` + index | yes |
| `2026-08-04-service-images.sql` | `crm_service_images` table + index | yes |
| `2026-08-04-temp-password-flag.sql` | `crm_temp_password_pending` on `businesses` and `staff`; nulls the plaintext | yes |

`2026-08-03-rate-limit.sql` was confirmed live by burst-probing `/api/subdomain/check` in
production and watching it turn 429 — the limiter fails open, so "no error" and "no limiter"
look identical from the outside and the table's existence had to be proved, not assumed.
