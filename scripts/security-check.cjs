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
