// Tests for everything that does not touch Telegram.
//
//   node test.mjs
//
// The Telegram-facing parts (sending, folders, event delivery) are NOT covered here and cannot
// be without a real session — they are written to fail soft instead. What IS covered is every
// decision about who gets messaged and what gets said, which is where a mistake is expensive.

import { extractUsernames, normalise, parseCommand } from "./lib/parse.mjs";
import { classify, detectLanguage } from "./lib/replies.mjs";
import { FAQ, INTERESTED, INTRO } from "./lib/messages.mjs";
import * as store from "./lib/state.mjs";

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

/* ------------------------------------------------------ username extraction */

check("plain @name", extractUsernames("@barber_shop"), ["barber_shop"]);
check("bare name", extractUsernames("barber_shop"), ["barber_shop"]);
check("t.me link", extractUsernames("https://t.me/barber_shop"), ["barber_shop"]);
check("t.me without protocol", extractUsernames("t.me/barber_shop"), ["barber_shop"]);
check("telegram.me", extractUsernames("telegram.me/barber_shop"), ["barber_shop"]);
check("link with query", extractUsernames("https://t.me/barber_shop?start=x"), ["barber_shop"]);

check(
  "all three forms collapse to one",
  extractUsernames("@barber_shop\nbarber_shop\nhttps://t.me/BARBER_SHOP"),
  ["barber_shop"]
);

check(
  "several per line",
  extractUsernames("@one_shop, @two_shop  @three_shop"),
  ["one_shop", "two_shop", "three_shop"]
);

check("order is preserved", extractUsernames("@zed_shop\n@alpha_shop"), ["zed_shop", "alpha_shop"]);
check("comments ignored", extractUsernames("# my list\n@real_shop"), ["real_shop"]);
check("blank lines ignored", extractUsernames("\n\n@real_shop\n\n"), ["real_shop"]);
check("trailing punctuation", extractUsernames("@real_shop, @other_shop."), ["real_shop", "other_shop"]);

// The dangerous ones: things that look like usernames and are not.
check("too short is rejected", extractUsernames("@abc"), []);
check("digits-first is rejected", extractUsernames("@1shop"), []);
check("phone number is not a username", extractUsernames("+998901234567"), []);
check("price line yields nothing", extractUsernames("• До 2 сотрудников — 175 000 сум/мес"), []);
check("a command is not a username", extractUsernames("/send"), []);
check("prose is not harvested", extractUsernames("привет как дела"), []);
check("empty input", extractUsernames(""), []);
check("the whole intro yields nothing", extractUsernames(INTRO.ru), []);

/* ------------------------------------------------------------------ commands */

check("simple command", parseCommand("/report"), { command: "report", args: [] });
check("with args", parseCommand("/status @shop"), { command: "status", args: ["@shop"] });
check("dry variant", parseCommand("/send dry"), { command: "send", args: ["dry"] });
check("case insensitive", parseCommand("/REPORT"), { command: "report", args: [] });
check("leading space tolerated", parseCommand("  /report"), { command: "report", args: [] });
check("not a command", parseCommand("report please"), null);
check("mid-text slash is not a command", parseCommand("see /report for this"), null);
check("bare slash", parseCommand("/"), null);
check("empty", parseCommand(""), null);

/* ------------------------------------------------------------ "+" detection */

for (const yes of ["+", "++", "да", "ok", "Ок", "ХОРОШО", "ha", "mayli", "  +  ", "Zo'r"]) {
  check(`"${yes}" is interested`, classify(yes).intent, "interested");
}

// The ones that must NOT read as agreement.
check("phone number is not a +", classify("+998 90 123 45 67").intent !== "interested", true);
check("'да нет' is not agreement", classify("да нет, дорого").intent !== "interested", true);
check("'+ но' is not a bare +", classify("+ но сколько стоит").intent !== "interested", true);

check("interested gets the follow-up", classify("+").send, INTERESTED.ru);

/* ------------------------------------------------------------- declining */

for (const no of ["не надо", "не интересно", "спам", "kerak emas", "не пишите мне"]) {
  check(`"${no}" declines`, classify(no).intent, "declined");
  check(`"${no}" gets NO reply`, classify(no).send, null);
}

/* ----------------------------------------------------------- Uzbek request */

for (const ask of ["можете на узбекском?", "o'zbekcha yozing", "uzbekcha", "уз тилида"]) {
  const verdict = classify(ask);
  check(`"${ask}" switches language`, verdict.lang, "uz");
  check(`"${ask}" resends the intro in Uzbek`, verdict.send, INTRO.uz);
}

/* ------------------------------------------------------------------- FAQ */

const faqCases = [
  ["сколько стоит?", "price"],
  ["какие тарифы", "price"],
  ["narxi qancha", "price"],
  ["а бесплатно правда?", "trial"],
  ["bepul mi", "trial"],
  ["комиссию берете?", "commission"],
  ["как подключиться", "setup"],
  ["долго настраивать?", "setup"],
  ["через телеграм можно?", "telegram"],
  ["у нас нет сайта", "website"],
  ["сколько сотрудников можно", "staff"],
  ["напоминания есть?", "reminders"],
  ["с телефона работает?", "devices"],
];
for (const [question, expected] of faqCases) {
  const verdict = classify(question);
  check(`FAQ "${question}" -> ${expected}`, verdict.faqId, expected);
  check(`FAQ "${question}" has an answer`, typeof verdict.send === "string" && verdict.send.length > 20, true);
}

check("every FAQ entry answers in both languages",
  FAQ.every((e) => typeof e.ru === "string" && e.ru.length > 20 && typeof e.uz === "string" && e.uz.length > 20),
  true);
check("no duplicate FAQ ids", new Set(FAQ.map((e) => e.id)).size, FAQ.length);

// Uzbek question gets the Uzbek answer.
{
  const verdict = classify("narxi qancha bo'ladi");
  check("Uzbek pricing question answers in Uzbek", verdict.send, FAQ.find((e) => e.id === "price").uz);
}

/* ------------------------------------------------- unknown -> a person, quietly */

{
  const verdict = classify("а вы можете приехать к нам в офис в четверг после обеда?");
  check("unrecognised question is flagged", verdict.intent, "question");
  check("unrecognised question still gets a short handoff", typeof verdict.send, "string");
}
check("empty message says nothing", classify("").send, null);
check("whitespace only says nothing", classify("   \n  ").send, null);

/* ------------------------------------------------------------- normalising */

check("apostrophes fold", normalise("O‘zbek"), "o'zbek");
check("punctuation flattens", normalise("Narxi qancha???"), "narxi qancha");
check("case folds", normalise("СКОЛЬКО"), "сколько");
check("plus survives", normalise("+"), "+");

/* ----------------------------------------------------------------- language */

check("russian by default", detectLanguage("сколько стоит"), "ru");
check("one uzbek word is not enough", detectLanguage("qancha"), "ru");
check("several uzbek words switch", detectLanguage("narxi qancha bo'ladi"), "uz");

/* -------------------------------------------------------------------- state */

{
  const s = { contacts: {} };
  const row = store.get(s, "Some_Shop");
  check("usernames key lowercase", row.username, "some_shop");
  check("same row for either case", store.get(s, "SOME_SHOP"), row);

  row.status = "sent";
  row.sentAt = new Date(Date.now() - 72 * 3600_000).toISOString();
  store.get(s, "other_shop");

  check("pending skips the sent one", store.pending(s, ["some_shop", "other_shop"]), ["other_shop"]);

  const summary = store.summarise(s);
  check("summary counts", [summary.total, summary.sent, summary.queued], [2, 1, 1]);
  check("silent after 48h", summary.silent, 1);

  row.reply = "interested";
  check("no longer silent once they replied", store.summarise(s).silent, 0);
  check("interested counted", store.summarise(s).interested, 1);

  check("lookup by user id", store.byUserId(s, "123"), null);
  row.userId = "123";
  check("lookup by user id finds it", store.byUserId(s, 123).username, "some_shop");
}

/* ------------------------------------------------------------ message sanity */

check("intro exists in both languages", [INTRO.ru.length > 400, INTRO.uz.length > 400], [true, true]);
check("both intros list four tariffs",
  [(INTRO.ru.match(/175 000|299 000|499 000|799 000/g) ?? []).length,
   (INTRO.uz.match(/175 000|299 000|499 000|799 000/g) ?? []).length],
  [4, 4]);
check("both intros ask for +", [INTRO.ru.includes("«+»"), INTRO.uz.includes("«+»")], [true, true]);
check("follow-up links the site", [INTERESTED.ru.includes("easyq.uz"), INTERESTED.uz.includes("easyq.uz")], [true, true]);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
