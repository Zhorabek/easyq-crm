// The shop's Telegram link must lead to the shop.
//
// This breaks silently and expensively: the link still opens the bot, so nothing errors — the
// customer just lands in a directory of every business on the platform and has to go find the
// one whose link they tapped. Half of them won't.
//
// The two halves live in different repositories, so nothing but this file checks that the
// payload the CRM writes is a payload the bot can read.

const fs = require('fs');
const path = require('path');

const BOT = path.resolve('../easyqueue-client-bot');

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) { pass += 1; return; }
  fail += 1;
  console.log(`FAIL  ${label}`);
}

const worker = fs.readFileSync('src/worker.ts', 'utf8');

/* --------------------------------------------- the link the CRM hands out */

// Read the whole block rather than extracting the template: the URL contains a NESTED template
// literal for the id fallback, so a `[^`]+` capture stops at its backtick and truncates the
// value — which failed on correct code.
const clientBlock = (worker.match(/id: "client-bot",[\s\S]*?kind: "public"/) || [])[0];
check('the client bot link exists', Boolean(clientBlock));
check('it carries a start payload', /\?start=/.test(clientBlock || ''));
check('the payload is the slug, falling back to b<id>',
  /business\.slug \|\| `b\$\{business\.id\}`/.test(clientBlock || ''));

// The owner's bot link is not shared with customers, so it stays plain.
const ownerLink = (worker.match(/id: "business-admin",[\s\S]*?url: `([^`]+)`/) || [])[1];
check('the owner bot link is unchanged', Boolean(ownerLink) && !/\?start=/.test(ownerLink));

/* ------------------------------------- payloads Telegram will actually pass */

// Telegram accepts A-Za-z0-9_- in a start payload, up to 64 characters. A slug that violated
// that would be silently dropped and the customer would land on the menu.
const SLUGS = ['barber777', 'vidok-barber', 'a', 'x'.repeat(64)];
for (const slug of SLUGS) {
  check(`slug "${slug.slice(0, 20)}" is a legal start payload`, /^[A-Za-z0-9_-]{1,64}$/.test(slug));
}
check('a b<id> fallback is legal', /^[A-Za-z0-9_-]{1,64}$/.test('b1284'));

/* ------------------------------------------------ the bot reads it back */

if (!fs.existsSync(BOT)) {
  console.log('\nclient bot repo not found next to this one — skipped its half');
} else {
  const service = fs.readFileSync(path.join(BOT, 'src/services/business.service.ts'), 'utf8');
  const message = fs.readFileSync(path.join(BOT, 'src/handlers/message.ts'), 'utf8');
  const callback = fs.readFileSync(path.join(BOT, 'src/handlers/callback.ts'), 'utf8');

  check('the bot can resolve a start payload', /getBusinessByStartPayload/.test(service));
  check('it resolves b<id>', /\^b\(\\d\+\)\$/.test(service));
  check('it resolves a slug', /WHERE slug = \?/.test(service));
  check('slug lookups are pattern-bounded before querying', /\^\[a-z0-9-\]\{1,64\}\$/.test(service));

  // The bug this replaces: `text === "/start"` ignored everything after the command.
  check('/start with an argument is parsed', /text\.startsWith\("\/start "\)/.test(message));
  check('the payload is looked up', /getBusinessByStartPayload\(startPayload\)/.test(message));
  check('a resolved shop goes straight to its card', /sendBusinessCard\(env, chatId, lang, business\)/.test(message));

  // A first-time user has to choose a language first; the shop must survive that detour.
  check('the language buttons carry the pending payload', /lang_ru\$\{tail\}/.test(message));
  check('the language handler reads it back', /data\.split\("\|"\)\[1\]/.test(callback));
  check('and then opens the shop', /await sendBusinessCard\(env, chatId, lang, business\);/.test(callback));

  // One card renderer, used by both paths.
  check('the card is shared, not duplicated', (callback.match(/export async function sendBusinessCard/g) || []).length === 1);
  check('the catalogue uses the same renderer', /await sendBusinessCard\(env, chatId, lang, business, category\);/.test(callback));

  // An unknown slug must not dead-end.
  check('an unresolvable payload still shows the menu', /t\(lang, "main_menu"\), mainMenuKeyboard\(lang\)/.test(message));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
