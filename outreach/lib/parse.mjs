// Pure text parsing. No Telegram, no disk — so it is all directly testable, which matters
// because a mistake here means messaging the wrong person.

/**
 * Telegram usernames: 5–32 characters, letters/digits/underscore, must start with a letter.
 *
 * Deliberately strict. A loose pattern would pick up "@2" out of "до 2 сотрудников" and try to
 * resolve it, and every junk resolution is an API call that counts against the account.
 */
const USERNAME = /^[a-z][a-z0-9_]{4,31}$/;

/**
 * Pull every username out of a block of text.
 *
 * Accepts the three forms a person actually pastes — `@name`, a bare `name`, and a `t.me/name`
 * link (with or without protocol, with or without query junk) — and normalises them to a bare
 * lowercase name so the same person written three ways is one person downstream.
 *
 * Lines starting with `#` are comments. Order is preserved and duplicates are dropped, keeping
 * the first occurrence, so the list reads in the order it was written.
 */
export function extractUsernames(text) {
  const seen = new Set();
  const out = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // A line may hold several, separated by spaces or commas.
    const tokens = line.split(/[\s,;]+/).filter(Boolean);

    for (const rawToken of tokens) {
      let token = rawToken.trim().toLowerCase();
      if (!token) continue;

      const link = token.match(/(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/([^/?#]+)/);
      const marked = token.startsWith("@") || Boolean(link);

      // Strip a t.me link down to its final path segment.
      if (link) token = link[1];

      token = token.replace(/^@/, "");
      // Trailing punctuation from prose: "@shop." or "@shop,"
      token = token.replace(/[.,;:!?)\]}'"«»]+$/, "");

      // `+` markers, arrows and other list decoration people leave in.
      if (!token || token.startsWith("+") || token.startsWith("/")) continue;
      if (!USERNAME.test(token)) continue;

      // An UNMARKED word only counts when it is alone on its line.
      //
      // Without this, running /send against a message of ordinary prose harvests words out of
      // it: the intro text alone yields "easyq" and "telegram", and the bot would cheerfully
      // message both. A bare list still works — one name per line is how a list is written —
      // but a sentence never produces a recipient.
      if (!marked && tokens.length > 1) continue;

      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }

  return out;
}

/**
 * A command typed into Saved Messages.
 *
 * Returns `{ command, args }` or null. Only ever recognises a message that STARTS with a
 * slash, so an ordinary note to self containing the word "report" is not a command.
 */
export function parseCommand(text) {
  const line = String(text ?? "").trim();
  if (!line.startsWith("/")) return null;

  const [word, ...rest] = line.split(/\s+/);
  const command = word.slice(1).toLowerCase().split("@")[0];
  if (!command) return null;

  return { command, args: rest };
}

/**
 * Normalise an incoming message for keyword matching.
 *
 * Lowercased, Uzbek apostrophes folded to a plain one (o'/oʻ/o` are the same word), punctuation
 * flattened to spaces, whitespace collapsed. Everything in replies.mjs matches against this
 * rather than raw text, so "Narxi qancha???" and "narxi qancha" behave identically.
 */
export function normalise(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[‘’ʼʻ`´]/g, "'")
    .replace(/[^\p{L}\p{N}'+\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
