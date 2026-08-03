// Who has been contacted, what happened, and what is owed a human reply.
//
// A single JSON file, rewritten atomically. Not a database: the whole point is that you can
// open state.json and read it, and that losing the process never loses the record of who has
// already been messaged — which is the one mistake that cannot be undone.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const FILE = new URL("../state.json", import.meta.url);
const TEMP = new URL("../state.json.tmp", import.meta.url);

/**
 * One row per username.
 *
 * `status` is the OUTREACH state — what happened when we wrote to them:
 *   queued      known, not yet written to
 *   sent        delivered
 *   blocked     they have blocked the account, or their privacy refuses strangers
 *   unresolved  no such username
 *   failed      something else, retried next run
 *
 * `reply` is what THEY did, which is a separate axis — somebody can be `sent` and `declined`,
 * or `sent` and `interested`. Collapsing the two into one field is how "did we contact them"
 * and "did they answer" stop being answerable separately.
 */
function blank(username) {
  return {
    username,
    userId: null,
    name: null,
    status: "queued",
    detail: null,
    sentAt: null,
    reply: "none",
    lastIncomingAt: null,
    incomingCount: 0,
    autoReplies: 0,
    lastAutoReplyAt: null,
    faqAnswered: [],
    needsHuman: false,
    folder: null,
  };
}

export function load() {
  if (!existsSync(FILE)) return { contacts: {}, updatedAt: null };
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return { contacts: parsed.contacts ?? {}, updatedAt: parsed.updatedAt ?? null };
  } catch (error) {
    // Refuse to start rather than silently beginning from an empty ledger — that would mean
    // re-messaging everyone already contacted, which is exactly the damage this file prevents.
    console.error(`
state.json exists but will not parse: ${error.message}

Refusing to continue, because starting from an empty ledger would message everybody again.
Fix or move the file, then re-run.`);
    process.exit(1);
  }
}

/**
 * Write through a temp file and rename.
 *
 * A rename is atomic on both Windows and POSIX, so a kill mid-write leaves the previous
 * complete file rather than a truncated one. Writing in place does not have that property, and
 * this file is the only record of who has already been messaged.
 */
export function save(state) {
  const payload = JSON.stringify({ updatedAt: new Date().toISOString(), contacts: state.contacts }, null, 2);
  writeFileSync(TEMP, `${payload}\n`, "utf8");
  renameSync(TEMP, FILE);
}

export function get(state, username) {
  const key = String(username).toLowerCase();
  if (!state.contacts[key]) state.contacts[key] = blank(key);
  return state.contacts[key];
}

export function byUserId(state, userId) {
  const wanted = String(userId);
  return Object.values(state.contacts).find((row) => String(row.userId) === wanted) ?? null;
}

export function all(state) {
  return Object.values(state.contacts);
}

/** Everyone who has never been successfully written to. */
export function pending(state, usernames) {
  return usernames.filter((username) => {
    const row = state.contacts[username];
    return !row || row.status !== "sent";
  });
}

/**
 * The numbers behind /report.
 *
 * `silent` is the one worth looking at: contacted, delivered, and no reply at all after the
 * grace period. That is the list to stop thinking about, not to chase.
 */
export function summarise(state, { silentAfterHours = 48 } = {}) {
  const rows = all(state);
  const now = Date.now();
  const olderThan = (iso) => iso && now - new Date(iso).getTime() > silentAfterHours * 3600_000;

  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    queued: rows.filter((r) => r.status === "queued").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
    unresolved: rows.filter((r) => r.status === "unresolved").length,
    failed: rows.filter((r) => r.status === "failed").length,
    interested: rows.filter((r) => r.reply === "interested").length,
    asked: rows.filter((r) => r.reply === "question").length,
    declined: rows.filter((r) => r.reply === "declined").length,
    needsHuman: rows.filter((r) => r.needsHuman).length,
    silent: rows.filter((r) => r.status === "sent" && r.reply === "none" && olderThan(r.sentAt)).length,
    replied: rows.filter((r) => r.incomingCount > 0).length,
  };
}
