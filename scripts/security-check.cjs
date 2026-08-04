// Security invariants for the Worker, asserted against the source.
//
// These are the properties that were violated and got fixed, plus the ones that are easy to
// violate again by adding a route. They are cheap to check and each one maps to a real hole:
// a second login door with no throttle, an unbounded write into D1, a page that any site can
// frame.

const fs = require('fs');

const worker = fs.readFileSync('src/worker.ts', 'utf8');
const limits = fs.readFileSync('src/server/rateLimit.ts', 'utf8');
const auth = fs.readFileSync('src/server/auth.ts', 'utf8');

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${label}`);
}

/* ------------------------------------------------- parse the router blocks */

const blocks = [];
const re = /^      if \((.*?)\) \{$/gm;
let m;
while ((m = re.exec(worker))) {
  let d = 1;
  let i = re.lastIndex;
  while (d > 0 && i < worker.length) {
    if (worker[i] === '{') d += 1;
    else if (worker[i] === '}') d -= 1;
    i += 1;
  }
  blocks.push({ cond: m[1].replace(/\s+/g, ' '), body: worker.slice(re.lastIndex, i) });
}
check('router blocks parsed', blocks.length > 30);

/* ---------------------------------------------------------- authentication */

// EVERY door that checks a password must be throttled. /api/auth/session-login was not, so the
// limit on /api/auth/login only decided which URL an attacker would use.
const credentialDoors = blocks.filter(
  (b) => /verifyCrmPassword/.test(b.body) || /login\(env, request/.test(b.body) || /sessionLogin\(env, request/.test(b.body)
);
check('credential doors found', credentialDoors.length >= 2);

// Brace-matched, not a fixed window: the first version read 3000 characters from the function
// start, which stopped short of where both decoy calls actually live and reported them missing.
function functionBody(src, signature) {
  const at = src.indexOf(signature);
  if (at === -1) return null;
  let i = src.indexOf('{', at);
  let d = 0;
  const start = i;
  while (i < src.length) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') {
      d -= 1;
      if (d === 0) return src.slice(start, i + 1);
    }
    i += 1;
  }
  return null;
}

// Throttling belongs to the entry point; the decoy belongs to whichever function owns the LAST
// branch where a username can fail to resolve. login() delegates that to loginStaff(), so
// asserting the decoy inside login() itself failed on correct code — the check has to follow
// the same fall-through the request does.
for (const fn of ['async function login(', 'async function sessionLogin(']) {
  const body = functionBody(worker, fn);
  const name = fn.slice(15, -1);
  check(`${name} exists`, body !== null);
  if (!body) continue;
  check(`${name} throttles per IP`, /requireUnderRateLimit\(env, request, LIMITS\.loginPerIp\)/.test(body));
  check(`${name} throttles per username`, /requireUnderRateLimit\(env, request, LIMITS\.loginPerUser, username\)/.test(body));

  // Follow one level of delegation to find where the failure path ends.
  const delegate = (body.match(/return await (\w+)\(env, request/) || [])[1];
  const failurePath = delegate ? `${body}
${functionBody(worker, `async function ${delegate}(`) ?? ''}` : body;
  check(`${name} burns a decoy hash on the not-found branch`, /verifyAgainstDecoy\(password\)/.test(failurePath));
  if (delegate) check(`${name} delegates to ${delegate}`, true);
}

check('session cookie is HttpOnly', /HttpOnly/.test(auth));
check('session cookie is SameSite', /SameSite=Lax/.test(auth));
check('session cookie is Secure over https', /protocol === "https:" \? "; Secure"/.test(auth));
check('session HMAC compared in constant time', /timingSafeEqualString/.test(auth));

/* ----------------------------------------------------------- authorization */

// Every authenticated route states a capability. /api/me/password is the one exception: it
// changes the CALLER's own password, so there is no capability it could require that would not
// also be true of anyone holding the session.
const authed = blocks.filter((b) => /requireAuthenticatedBusiness/.test(b.body));
const uncapped = authed.filter((b) => !/requireCapability/.test(b.body));
check('authenticated routes exist', authed.length > 15);
check('only /api/me/password is authenticated without a capability',
  uncapped.length === 1 && /me\/password/.test(uncapped[0].cond));

/* -------------------------------------------------------------- SQL safety */

// Interpolation into SQL is allowed only for generated placeholder lists and the two image
// store constants. Anything else is a value that belongs in a bind.
const interpolated = [...worker.matchAll(/prepare\(\s*`([^`]*\$\{[^`]*)`/g)].map((x) => x[1]);
for (const sql of interpolated) {
  const holes = [...sql.matchAll(/\$\{([^}]+)\}/g)].map((x) => x[1].trim());
  for (const hole of holes) {
    check(`SQL interpolates only safe values (${hole})`,
      hole === 'placeholders' || hole === 'store.table' || hole === 'store.ownerColumn');
  }
}
check('placeholder lists are generated, never user text',
  (worker.match(/const placeholders = \w+\.map\(\(\) => "\?"\)\.join\(", "\)/g) || []).length >= 3);

/* -------------------------------------------------------- writes into D1 */

// Uploads are authenticated, but the cost is storage, so they are throttled per BUSINESS.
check('an image upload limit exists', /imageUpload: \{ action: "imageupload"/.test(limits));
const uploadRoutes = blocks.filter((b) => /upload(BusinessPhoto|StaffPhoto|ServicePhoto)\(/.test(b.body));
check('three upload routes found', uploadRoutes.length === 3);
for (const route of uploadRoutes) {
  check(`upload route is throttled: ${route.cond.slice(0, 52)}`,
    /LIMITS\.imageUpload/.test(route.body));
  check(`upload throttle is keyed per business: ${route.cond.slice(0, 40)}`,
    /biz:\$\{actor\.business\.id\}/.test(route.body));
}

/* -------------------------------------------- plaintext credential storage */

// A generated password is shown once, at the moment it is created, and never stored. All the
// database keeps is the one bit the UI needs: is this account still on a password we issued.
// Before this, `crm_temp_password` held a readable password for every business and every staff
// member indefinitely, so read access to the database was login access to every account.
// Comments explaining the old column would otherwise trip the check below.
const codeOnly = worker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('the worker never reads or writes a plaintext temp password', !/crm_temp_password[^_]/.test(codeOnly));
check('the pending flag is what drives the warning', /crm_temp_password_pending/.test(codeOnly));
check('a generated password is still returned to its caller once', /password: tempPassword/.test(codeOnly));
check('issuing a password sets the flag by literal', /crm_temp_password_pending = 1/.test(codeOnly));

/* ------------------------------------------------- money redaction */

// Every money-bearing field must be emptied for roles without payment:write. `paymentsToday`
// was added to the payload and not to this gate, so a specialist received the amount, method
// and customer name of every payment the shop took that day.
const moneyGate = (worker.match(/if \(!can\(actor\.role, "payment:write"\)\) \{[\s\S]*?\n  \}/) || [''])[0];
check('a payment:write gate exists', moneyGate.length > 0);
for (const field of ['kpis: []', 'paymentsToday: []', 'analytics: {', 'dayRevenue: 0']) {
  check(`money gate clears ${field.replace(/[:{[\]]/g, '').trim()}`, moneyGate.includes(field));
}
// The payload declares the field, so the gate must know about it.
const payloadFields = [...worker.matchAll(/^    (\w+): paymentRowsToday/gm)].map((m) => m[1]);
for (const f of payloadFields) {
  check(`payload field "${f}" is inside the money gate`, moneyGate.includes(`${f}: []`));
}

// The per-staff service breakdown is a transport field: it exists so a master's donut can be
// scoped, and it must leave the payload for EVERY role, not just the one that consumes it.
check('services carry a per-staff breakdown server-side', /bookingsCountByStaff: serviceBookings\.reduce/.test(worker));
check('a master reads their own count from it', /bookingsCountByStaff\?\.\[String\(mine\)\] \?\? 0/.test(worker));
check('the breakdown is stripped for every role', /bookingsCountByStaff: _dropped, \.\.\.service/.test(worker));
// Stripped OUTSIDE the scoped branch, or a role added later keeps it.
const scopedBranch = (worker.match(/if \(isScopedToOwnBookings\(actor\.role\)[\s\S]*?\n  \}/) || [''])[0];
check('the strip is not inside the specialist-only branch', !scopedBranch.includes('_dropped'));

/* ------------------------------------------------------------- headers */

check('every response goes through withSecurityHeaders',
  /return withSecurityHeaders\(await router\.handle\(request, env\), env\)/.test(worker));
check('nosniff is set', /x-content-type-options", "nosniff"/.test(worker));
check('referrer policy is set', /referrer-policy", "strict-origin-when-cross-origin"/.test(worker));
check('framing is restricted', /frame-ancestors \$\{ancestors/.test(worker));
// A flat DENY would break the landing's demo iframe, so the allowlist must keep 'self' plus the
// tenant roots — and must NOT be a wildcard.
check('frame-ancestors is an allowlist, not a wildcard', !/frame-ancestors \*/.test(worker));
check('frame-ancestors includes self', /const ancestors = \["'self'"\]/.test(worker));

// form-action must cover where the app's own forms actually post.
//
// The login flow posts credentials cross-origin to <slug>.<apex>/api/auth/session-login so the
// tenant host sets its own cookie. `form-action 'self'` silently blocked that: no redirect, and
// a login page that appeared to do nothing. A CSP that forbids something the app does is not a
// stricter policy, it is a broken feature.
const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
const formTargets = [...appSrc.matchAll(/form\.action = `([^`]+)`/g)].map((m) => m[1]);
check('the login form posts to a tenant host', formTargets.some((t) => /\$\{slug\}\.\$\{apexHost\(\)\}/.test(t)));
// Against the comment-stripped source: the comment explaining this very fix contains the
// string "form-action 'self'", and matching it there fails on correct code.
check('form-action is not locked to self', !/form-action 'self'`/.test(codeOnly));
check('form-action is built from the tenant roots', /form-action \$\{formTargets\.join\(" "\)\}/.test(worker));
check('form-action allows subdomains of each root', /formTargets\.push\(`https:\/\/\$\{root\}`, `https:\/\/\*\.\$\{root\}`\)/.test(worker));

/* -------------------------------------------------- error disclosure */

check('public endpoints do not echo internal errors',
  /url\.pathname\.startsWith\("\/api\/public\/"\)[\s\S]{0,200}Something went wrong/.test(worker));

/* ------------------------------------------------------------ dispatch */

// Every handler is dispatched with `return await`; a bare `return promise` inside try/catch
// adopts the promise and lets a later rejection escape as an unhandled rejection.
const bareReturns = [...worker.matchAll(/^        return (?!await |json\(|new Response|withSecurityHeaders|asset)(\w+\()/gm)]
  .map((x) => x[1]);
check('every dispatched handler uses `return await`', bareReturns.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
