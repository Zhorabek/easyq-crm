/**
 * The in-progress booking, encoded in the URL.
 *
 * A booking is assembled from three independent selections, and the customer may answer them
 * in any order. Holding that only in component state means a refresh, a back button, or a link
 * sent to the person actually paying loses everything. So the selection lives in the query
 * string and the component rebuilds from it on load.
 *
 * ## Format
 *
 *   ?m12&s3&s7&d202607311430
 *
 *   m<id>   the chosen specialist
 *   s<id>   a chosen service; REPEATABLE, and order is the order they were ticked
 *   d<code> the chosen slot, as YYYYMMDDHHmm
 *
 * Flag-style keys rather than `?staff=12&services=3,7&datetime=...` because this string is
 * shown to customers and often pasted into a chat. Short and opaque beats long and
 * self-describing when the alternative wraps onto two lines in Telegram.
 *
 * ## Why the datetime is one code
 *
 * A date without a time is not a selection, and a time without a date is meaningless. Encoding
 * them as one token makes the invalid halves unrepresentable rather than something every
 * reader has to check for.
 */

export type BookingSelection = {
  staffId: number | null;
  serviceIds: number[];
  /** ISO date, `2026-07-31`. Null unless a full slot is chosen. */
  date: string | null;
  /** `14:30`. Null unless a full slot is chosen. */
  time: string | null;
};

export const EMPTY_SELECTION: BookingSelection = { staffId: null, serviceIds: [], date: null, time: null };

/** `2026-07-31` + `14:30` -> `202607311430`. */
export function encodeSlot(date: string, time: string): string {
  return `${date.replace(/-/g, "")}${time.replace(":", "")}`;
}

/**
 * `202607311430` -> `{ date, time }`, or null.
 *
 * Validated by shape AND by round trip: a code like `202602311430` is twelve digits and
 * parses, but 31 February is not a day. Rebuilding the string from the parsed parts and
 * comparing catches that without a date library.
 */
export function decodeSlot(code: string): { date: string; time: string } | null {
  if (!/^\d{12}$/.test(code)) return null;
  const date = `${code.slice(0, 4)}-${code.slice(4, 6)}-${code.slice(6, 8)}`;
  const time = `${code.slice(8, 10)}:${code.slice(10, 12)}`;

  const hour = Number(code.slice(8, 10));
  const minute = Number(code.slice(10, 12));
  if (hour > 23 || minute > 59) return null;

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // A real date survives the round trip; 2026-02-31 comes back as 2026-03-03 and fails here.
  if (parsed.toISOString().slice(0, 10) !== date) return null;

  return { date, time };
}

/**
 * Read a selection out of a query string.
 *
 * Total: anything unparseable is ignored rather than throwing. This runs on whatever a
 * customer's browser happened to have in its address bar, including a link somebody hand-edited
 * or a bookmark from a previous version, and a booking page that crashes on a stray character
 * is worse than one that starts empty.
 */
export function parseSelection(search: string): BookingSelection {
  const out: BookingSelection = { staffId: null, serviceIds: [], date: null, time: null };
  const query = String(search ?? "").replace(/^\?/, "");
  if (!query) return out;

  const seen = new Set<number>();
  for (const rawPart of query.split("&")) {
    // Flags carry no `=`, but tolerate `m=12` too — a hand-edited link should still work.
    //
    // decodeURIComponent THROWS on a malformed escape like `%%%`, which is exactly the kind of
    // thing that reaches a URL through a truncated paste. Guarded rather than trusted: this
    // function promises never to throw, and that promise is the reason a mangled link starts an
    // empty booking instead of a blank page.
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawPart);
    } catch {
      continue;
    }
    const part = decoded.replace("=", "");
    if (!part) continue;

    const kind = part[0];
    const value = part.slice(1);

    if (kind === "m") {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) out.staffId = id;
    } else if (kind === "s") {
      const id = Number(value);
      // Deduplicated here as well as in the basket: a link with ?s3&s3 is a copy-paste
      // accident, and it must not become two charges just because it arrived by URL.
      if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        out.serviceIds.push(id);
      }
    } else if (kind === "d") {
      const slot = decodeSlot(value);
      if (slot) {
        out.date = slot.date;
        out.time = slot.time;
      }
    }
  }
  return out;
}

/**
 * Render a selection back to a query string, including the leading `?`.
 *
 * Returns "" for an empty selection so the caller can strip the query entirely rather than
 * leaving a bare `?` in the address bar.
 */
export function stringifySelection(selection: BookingSelection): string {
  const parts: string[] = [];
  if (selection.staffId) parts.push(`m${selection.staffId}`);
  for (const id of selection.serviceIds) parts.push(`s${id}`);
  if (selection.date && selection.time) parts.push(`d${encodeSlot(selection.date, selection.time)}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** Which selections are still missing, in the order the flow should ask for them. */
export type MissingStep = "staff" | "service" | "datetime" | null;

/**
 * The next thing the customer has to choose, or null when the booking is complete.
 *
 * Drives the sticky CTA, which is why it returns the STEP rather than a boolean: the button
 * has to name where it is going ("Choose services"), and deriving that from one function means
 * the label and the destination can never disagree.
 *
 * Services before date and time on purpose — the slot list cannot be correct until the total
 * duration is known, so asking for a time first would offer slots that may not fit.
 */
export function nextMissingStep(selection: BookingSelection, opts: { needsStaff: boolean }): MissingStep {
  if (opts.needsStaff && !selection.staffId) return "staff";
  if (selection.serviceIds.length === 0) return "service";
  if (!selection.date || !selection.time) return "datetime";
  return null;
}
