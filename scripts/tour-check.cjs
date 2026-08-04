// Static wiring check for the guided tour.
//
// The tour breaks silently: a step whose anchor was renamed just stops spotlighting, and a step
// whose copy is missing in one language shows a blank card only to owners using that language.
// Neither throws. So the checks are about WIRING, not rendering.

const fs = require('fs');

const tourSrc = fs.readFileSync('src/crm/Tour.tsx', 'utf8');
const i18nSrc = fs.readFileSync('src/crm/i18n.tsx', 'utf8');
const shellSrc = fs.readFileSync('src/crm/shell.tsx', 'utf8');
const appSrc = fs.readFileSync('src/App.tsx', 'utf8');

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${label}`);
}

/* ------------------------------------------------------- parse what ships */

const steps = [...tourSrc.matchAll(/\{ key: '(\w+)', target: (?:'([\w-]+)'|null)(?:, screen: '(\w+)')? \}/g)]
  .map((m) => ({ key: m[1], target: m[2] ?? null, screen: m[3] ?? null }));

const locales = [...i18nSrc.matchAll(/tour: \{[\s\S]*?\n    \}/g)].map((m) => m[0]);
const localeNames = ['uz', 'ru', 'en'];

// data-tour anchors the shell actually renders. `nav-${key}` is templated, so expand it.
const navItems = (shellSrc.match(/const NAV_ITEMS: string\[\] = \[([\s\S]*?)\]/) || [])[1] || '';
const navKeys = [...navItems.matchAll(/'(\w+)'/g)].map((m) => m[1]);
const literalAnchors = [...shellSrc.matchAll(/data-tour=(?:"([\w-]+)"|\{[^}]*?'([\w-]+)'[^}]*?\})/g)]
  .map((m) => m[1] ?? m[2])
  .filter(Boolean);
const anchors = new Set([...literalAnchors, ...navKeys.map((k) => `nav-${k}`)]);

const roleScreens = {};
const roleBlock = (appSrc.match(/const ROLE_SCREENS[\s\S]*?\n\};/) || [''])[0];
for (const m of roleBlock.matchAll(/^\s{2}(\w+): (null|\[[\s\S]*?\]),$/gm)) {
  roleScreens[m[1]] = m[2] === 'null' ? null : [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]);
}

console.log(`steps: ${steps.length}  locales: ${locales.length}  roles: ${Object.keys(roleScreens).join(', ')}`);

/* ------------------------------------------------------------- the checks */

check('nine steps parsed', steps.length === 9);
check('three locales parsed', locales.length === 3);

// 1. Every step has copy in EVERY language. This is the blank-card bug.
for (const s of steps) {
  locales.forEach((block, i) => {
    check(`copy for "${s.key}" exists in ${localeNames[i]}`, new RegExp(`\\b${s.key}: \\{ title:`).test(block));
  });
}

// Role variants: same step, different words when the role changes what it can honestly say.
// Parsed from copyKeyFor so this file cannot fall behind the component.
const variants = [...tourSrc.matchAll(/return '(\w+)';/g)].map((m) => m[1]);
const validCopy = new Set([...steps.map((s) => s.key), ...variants]);
check('two role variants are declared', variants.length === 2);

// 2. No locale carries copy for a step or variant that no longer exists (dead translation).
locales.forEach((block, i) => {
  const keys = [...block.matchAll(/^\s{8}(\w+): \{ title:/gm)].map((m) => m[1]);
  check(`${localeNames[i]} has no orphan step copy`, keys.every((k) => validCopy.has(k)));
  check(`${localeNames[i]} copy count matches`, keys.length === validCopy.size);
});

// 2b. Every variant is translated everywhere too.
for (const v of variants) {
  locales.forEach((block, i) => {
    // Substring, not RegExp: `\b` inside a template literal is a BACKSPACE character, not a
    // word boundary, so the first version of this line searched for a control code and reported
    // every locale as missing copy that was sitting right there.
    check(`variant "${v}" exists in ${localeNames[i]}`, block.includes(`${v}: { title:`));
  });
}

// 2c. Resolve the copy each role actually READS, and prove the wrong instruction is gone.
//     Filtering by access is not enough: a step can survive the filter and still tell someone to
//     do something they have no button for.
function copyKeyFor(stepKey, role, allowed) {
  if (stepKey === 'staff' && role !== 'owner') return 'staffNoAccess';
  if (stepKey === 'finish' && allowed && !allowed.includes('services')) return 'finishNoServices';
  return stepKey;
}
const resolved = {};
for (const [role, allowed] of Object.entries(roleScreens)) {
  resolved[role] = steps
    .filter((s) => !s.screen || !allowed || allowed.includes(s.screen))
    .map((s) => copyKeyFor(s.key, role, allowed));
}
check('owner reads the full-access Staff copy', resolved.owner.includes('staff'));
check('manager reads the no-access Staff copy', resolved.manager.includes('staffNoAccess'));
check('manager is NOT told to grant CRM access', !resolved.manager.includes('staff'));
check('owner ends on "add your first service"', resolved.owner.includes('finish'));
check('manager ends on "add your first service"', resolved.manager.includes('finish'));
check('specialist ends on their Schedule instead', resolved.specialist.includes('finishNoServices'));
check('specialist is NOT told to add a service', !resolved.specialist.includes('finish'));
for (const [role, keys] of Object.entries(resolved)) {
  check(`${role} resolves only to copy that exists`, keys.every((k) => validCopy.has(k)));
  console.log(`  ${role.padEnd(11)} reads: ${keys.join(', ')}`);
}

// 3. Every spotlight target is an anchor the shell really renders. THE regression that made the
//    tour point at nothing after screens moved.
for (const s of steps) {
  if (s.target) check(`anchor [data-tour="${s.target}"] exists in the shell`, anchors.has(s.target));
}

// 4. Every screen a step navigates to is a real screen.
const realScreens = new Set([...navKeys, 'settings']);
for (const s of steps) {
  if (s.screen) check(`screen "${s.screen}" is real`, realScreens.has(s.screen));
}

// 5. Role filtering: what each role would actually be shown.
for (const [role, allowed] of Object.entries(roleScreens)) {
  const visible = steps.filter((s) => !s.screen || !allowed || allowed.includes(s.screen));
  check(`${role} gets at least the welcome and finish steps`, visible.length >= 2);
  check(`${role} keeps the welcome step`, visible.some((s) => s.key === 'welcome'));
  check(`${role} keeps the finish step`, visible.some((s) => s.key === 'finish'));
  if (allowed) {
    for (const s of visible) {
      check(`${role} is never shown "${s.key}" without access`, !s.screen || allowed.includes(s.screen));
    }
  }
  console.log(`  ${role.padEnd(11)} sees ${visible.length}/${steps.length}: ${visible.map((s) => s.key).join(', ')}`);
}

// 6. The specialist case specifically — the one that produced a card describing a screen with no
//    nav item behind it.
const spec = steps.filter((s) => !s.screen || roleScreens.specialist.includes(s.screen));
check('specialist is not shown the Staff step', !spec.some((s) => s.key === 'staff'));
check('specialist is not shown the Services step', !spec.some((s) => s.key === 'services'));
check('specialist is not shown the Branding step', !spec.some((s) => s.key === 'branding'));

// 7. The finish action navigates somewhere the role can open.
check('finish guards the Services jump behind access', /allowed\.includes\('services'\)/.test(tourSrc));

// 8. Storage key is per business, not global.
check('tour flag is keyed per business', /easyq_crm_tour_done_\$\{session\?\.businessId/.test(appSrc));
// Must look at real localStorage CALLS: the first version of this check matched the string
// inside the comment explaining the fix, and failed on correct code.
const storageCalls = [...appSrc.matchAll(/localStorage\.(?:get|set)Item\(([^,)]+)/g)].map((m) => m[1].trim());
check('no global tour flag is read or written', !storageCalls.includes("'easyq_crm_tour_done'"));

// 9. Accessibility and i18n of the chrome.
check('card is a dialog', /role="dialog"/.test(tourSrc) && /aria-modal="true"/.test(tourSrc));
check('close button label is translated, not hardcoded', /aria-label=\{tour\.close\}/.test(tourSrc));
check('no hardcoded English aria-label left', !/aria-label="Close"/.test(tourSrc));
check('close copy exists in all three locales', locales.every((b) => /close: '/.test(b)));
check('Enter is not bound (it double-fired with the focused button)', !/e\.key === 'Enter'/.test(tourSrc));
check('Tab is trapped inside the card', /e\.key === 'Tab'/.test(tourSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
