// What to say back, and — more importantly — when to say nothing.
//
// Pure functions over a string. No Telegram, no state, so every rule here is testable, and the
// bot.mjs side only has to decide whether to act on the answer.

import { FAQ, HANDOFF, INTERESTED, INTRO } from "./messages.mjs";
import { normalise } from "./parse.mjs";

/**
 * Is this "+", or something that plainly means yes?
 *
 * Matched on the WHOLE message, not as a substring: "+" inside "+998 90 123 45 67" is a phone
 * number, and "да" inside "да нет, дорого" is a refusal. A short affirmative is only an
 * affirmative when it is the entire message.
 */
const AFFIRMATIVE = new Set([
  "+", "++", "+++", "да", "да +", "ok", "ок", "okay", "окей", "хорошо", "давай", "давайте",
  "интересно", "yes", "ha", "ha +", "mayli", "qiziq", "qiziqarli", "bo'ladi", "boladi",
  "roziman", "хоп", "хуп", "yaxshi", "zo'r", "zor",
]);

/** Somebody asking to be spoken to in Uzbek. */
const UZBEK_REQUEST = [
  "узбек", "o'zbek", "ozbek", "uzbek", "узбекча", "o'zbekcha", "ozbekcha", "uzbekcha",
  "уз тилида", "uz tilida", "o'zbek tilida", "ozbek tilida", "узбекский",
];

/** An explicit "no". Never auto-answered — it goes to a person, or nowhere. */
const NEGATIVE = [
  "не надо", "не нужно", "не интересно", "неинтересно", "отстаньте", "отписаться", "спам",
  "kerak emas", "qiziq emas", "keraksiz", "spam", "не пишите", "yozmang",
];

/**
 * Which language to answer in.
 *
 * Russian unless there is a reason not to: the intro went out in Russian, so a reply is
 * Russian-by-default and Uzbek only on request or when the message is visibly Uzbek. Guessing
 * language from a two-word message is unreliable, which is why the bar is a request or several
 * distinctly-Uzbek words, not one.
 */
const UZBEK_MARKERS = [
  "qancha", "narxi", "kerak", "bo'ladi", "boladi", "yaxshi", "rahmat", "salom", "assalomu",
  "xizmat", "mumkinmi", "qanday", "nima", "bepul", "so'm", "som", "yozilish", "xodim",
];

export function detectLanguage(text, fallback = "ru") {
  const clean = normalise(text);
  if (!clean) return fallback;
  if (UZBEK_REQUEST.some((needle) => clean.includes(needle))) return "uz";

  const hits = UZBEK_MARKERS.filter((word) => new RegExp(`(^| )${word}( |$)`).test(clean)).length;
  return hits >= 2 ? "uz" : fallback;
}

/**
 * Decide what an incoming message deserves.
 *
 * Returns an intent, plus the text to send when there is one. `send: null` means "a person
 * must handle this" — the bot stays quiet and the message is flagged instead. That is the
 * default for anything unrecognised, and it is the whole safety property of this file: the
 * account never improvises.
 */
/**
 * How many of `keywords` the message contains.
 *
 * A single-word keyword matches only at the START OF A WORD, never mid-word. That is not
 * fussiness — plain substring matching answered "с телефона работает?" with the Telegram blurb,
 * because "рабоТАет" contains "бот". Prefixes still work, which is the point: "бесплат" has to
 * match "бесплатно", "бесплатный" and "бесплатно?" without listing all three.
 *
 * Multi-word keywords ("не надо", "уз тилида") fall back to substring, since the word-boundary
 * question is already answered by the space inside them.
 */
function countMatches(clean, keywords) {
  const words = clean.split(" ");
  let score = 0;
  for (const keyword of keywords) {
    const hit = keyword.includes(" ")
      ? clean.includes(keyword)
      : words.some((word) => word.startsWith(keyword));
    if (hit) score += 1;
  }
  return score;
}

export function classify(text, options = {}) {
  const lang = options.lang ?? detectLanguage(text);
  const clean = normalise(text);

  if (!clean) return { intent: "empty", lang, send: null };

  // An explicit refusal. Answering it at all is what turns outreach into harassment, so this
  // is checked before everything and never produces a reply.
  if (NEGATIVE.some((needle) => clean.includes(needle))) {
    return { intent: "declined", lang, send: null };
  }

  // "+" and friends — only as the entire message.
  if (AFFIRMATIVE.has(clean)) {
    return { intent: "interested", lang, send: INTERESTED[lang] };
  }

  // "can you speak uzbek" — resend the intro in Uzbek rather than answering the question about
  // the question, which is what they are actually asking for.
  if (UZBEK_REQUEST.some((needle) => clean.includes(needle))) {
    return { intent: "language", lang: "uz", send: INTRO.uz };
  }

  // Best-matching FAQ entry, not merely the first.
  const scored = FAQ.map((entry) => ({ entry, score: countMatches(clean, entry.keywords) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    // Ties go to whichever is earlier in messages.mjs, so that ordering is still the tiebreak.
    const best = scored[0].entry;
    return { intent: "faq", faqId: best.id, lang, send: best[lang] };
  }

  // A real question we have no confident answer for. One short handoff, then silence — see
  // bot.mjs, which sends this at most once per person.
  return { intent: "question", lang, send: HANDOFF[lang] };
}
