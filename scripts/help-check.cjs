// Wiring check for the in-product guide.
//
// Docs fail quietly, in the two ways this file exists to catch:
//   1. A topic's "Open the screen" button points somewhere that moved or was renamed. The button
//      renders fine and does nothing useful.
//   2. A topic is translated in one language and not another, so a whole card vanishes for the
//      owners reading Uzbek and nobody using Russian ever notices.
//
// There are deliberately NO screenshots in the guide, so there is no third failure mode where a
// picture shows a product we no longer ship.

const fs = require('fs');

const helpSrc = fs.readFileSync('src/crm/Help.tsx', 'utf8');
const i18nSrc = fs.readFileSync('src/crm/i18n.tsx', 'utf8');
const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
const shellSrc = fs.readFileSync('src/crm/shell.tsx', 'utf8');
const iconSrc = fs.readFileSync('src/crm/icons.tsx', 'utf8');

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${label}`);
}

/* --------------------------------------------------------- what ships */

const topics = [...helpSrc.matchAll(
  /\{ key: '(\w+)', icon: '(\w+)'(?:, screen: '(\w+)')?(?:, ownerOnly: (true))? \}/g
)].map((m) => ({ key: m[1], icon: m[2], screen: m[3] ?? null, ownerOnly: Boolean(m[4]) }));

const localeNames = ['uz', 'ru', 'en'];
const locales = [...i18nSrc.matchAll(/    help: \{[\s\S]*?\n    \},/g)].map((m) => m[0]);

const iconNames = new Set([...iconSrc.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));

const realScreens = [...(appSrc.match(/const REAL_SCREENS = \[([\s\S]*?)\]/) || ['', ''])[1]
  .matchAll(/'(\w+)'/g)].map((m) => m[1]);

const navItems = [...(shellSrc.match(/const NAV_ITEMS: string\[\] = \[([\s\S]*?)\]/) || ['', ''])[1]
  .matchAll(/'(\w+)'/g)].map((m) => m[1]);

const roleScreens = {};
const roleBlock = (appSrc.match(/const ROLE_SCREENS[\s\S]*?\n\};/) || [''])[0];
for (const m of roleBlock.matchAll(/^\s{2}(\w+): (null|\[[\s\S]*?\]),$/gm)) {
  roleScreens[m[1]] = m[2] === 'null' ? null : [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]);
}

console.log(`topics: ${topics.length}  locales: ${locales.length}`);

/* ------------------------------------------------------------ the checks */

check('twelve topics parsed', topics.length === 12);
check('three locales parsed', locales.length === 3);

// 1. Every topic is written in every language, with steps.
for (const topic of topics) {
  locales.forEach((block, i) => {
    const found = block.includes(`${topic.key}: { title:`);
    check(`"${topic.key}" is written in ${localeNames[i]}`, found);
    if (!found) return;
    const slice = block.slice(block.indexOf(`${topic.key}: { title:`));
    const steps = (slice.slice(0, slice.indexOf('] }')).match(/^\s{10}'/gm) || []).length;
    check(`"${topic.key}" has steps in ${localeNames[i]}`, steps >= 3);
  });
}

// 2. No locale documents a topic that no longer exists.
locales.forEach((block, i) => {
  const keys = [...block.matchAll(/^\s{8}(\w+): \{ title:/gm)].map((m) => m[1]);
  check(`${localeNames[i]} has no orphan topic`, keys.every((k) => topics.some((topic) => topic.key === k)));
  check(`${localeNames[i]} documents every topic`, keys.length === topics.length);
});

// 3. Icons exist. A missing name renders an empty box, which looks like a broken image.
for (const topic of topics) {
  check(`icon "${topic.icon}" exists`, iconNames.has(topic.icon));
}

// 4. THE failure this file is for: every "Open the screen" button goes somewhere real.
for (const topic of topics) {
  if (!topic.screen) continue;
  check(`"${topic.key}" opens a registered screen (${topic.screen})`, realScreens.includes(topic.screen));
}

// 5. The guide itself is reachable: registered, routed, in the sidebar, and allowed for everyone.
check('help is a registered screen', realScreens.includes('help'));
check('help has a route', /^\s{2}help: Help,$/m.test(appSrc));
// Rendered as a literal button in the footer group beside Settings, not through NAV_ITEMS: the
// guide is not part of the daily working list, it is one of the two things you go to when
// something needs explaining or changing.
// The window has to clear the inline style attribute between the two, which is ~330 chars —
// a 220 window reported the button missing while it was sitting right there.
check('the guide has its own sidebar button', /data-tour="nav-help"[\s\S]{0,500}t\.nav\.help/.test(shellSrc));
check('it is styled like Settings', /nav-help"[\s\S]{0,120}crm-navbtn--on2/.test(shellSrc));
check('it sits ABOVE Settings', shellSrc.indexOf('data-tour="nav-help"') < shellSrc.indexOf('data-tour="nav-settings"'));
check('it is gated by access like Settings is', /const helpAllowed = !allowed \|\| allowed\.includes\('help'\);/.test(shellSrc));
check('it is no longer in the working nav list', !navItems.includes('help'));
check('help has a topbar title', /help: \{ title: t\.nav\.help/.test(appSrc));
for (const [role, allowed] of Object.entries(roleScreens)) {
  check(`${role} can open the guide`, allowed === null || allowed.includes('help'));
}
check('every locale names the sidebar item', (i18nSrc.match(/help: '[^']+', settings:/g) || []).length === 3);

// 6. Role filtering, mirroring Help.tsx: nobody is shown a topic for a screen they cannot open.
for (const [role, allowed] of Object.entries(roleScreens)) {
  const visible = topics.filter((topic) => {
    if (topic.ownerOnly && role !== 'owner') return false;
    if (topic.screen && allowed && !allowed.includes(topic.screen)) return false;
    return true;
  });
  check(`${role} sees at least the shared topics`, visible.length >= 3);
  for (const topic of visible) {
    check(`${role} is not shown "${topic.key}" without access`, !topic.screen || !allowed || allowed.includes(topic.screen));
  }
  check(`${role} sees the booking-link topic`, visible.some((topic) => topic.key === 'link'));
  console.log(`  ${role.padEnd(11)} sees ${visible.length}/${topics.length}: ${visible.map((topic) => topic.key).join(', ')}`);
}

check('only the owner is shown billing', !topics.filter((topic) => !topic.ownerOnly).some((topic) => topic.key === 'billing'));

// 7. No screenshots, by design — see the note at the top of Help.tsx.
check('the guide ships no images', !/<img|\.png|\.jpg|\.webp/.test(helpSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
