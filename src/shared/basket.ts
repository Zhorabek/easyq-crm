/**
 * The services chosen for one booking, priced and measured.
 *
 * Both booking paths — the public page and the CRM's manual modal — resolve their chosen
 * services through here, so the two can never disagree about what a basket costs or how long
 * it takes. They previously each read one service row and copied its price and duration; the
 * moment a booking could hold several, "the total" became a thing that needed one definition.
 */

export type BasketLine = {
  serviceId: number;
  name: string;
  price: number;
  duration: number;
};

export type Basket = {
  lines: BasketLine[];
  /** Sum of the line prices. What the customer is quoted and what the booking records. */
  totalPrice: number;
  /**
   * Sum of the line durations, and therefore how much of the day the booking occupies.
   *
   * This is the number availability has to reserve. Two 30-minute services back to back is a
   * one-hour block, and offering a slot that only fits the first is how a shop ends up
   * double-booked at half past.
   */
  totalDuration: number;
  /** First line. Written to the legacy single-service columns the Telegram bots still read. */
  primary: BasketLine;
};

/**
 * Which service ids a request is asking for.
 *
 * Accepts both shapes on purpose: `serviceIds` is what the booking page sends now, `serviceId`
 * is what an older cached bundle and the CRM modal send. Deduplicated while preserving order,
 * because ticking the same service twice is a mis-tap rather than an instruction to charge for
 * it twice — and a shop that genuinely sells two of something can add it as its own service.
 */
export function requestedServiceIds(input: { serviceId?: number; serviceIds?: number[] }): number[] {
  const raw = Array.isArray(input.serviceIds) && input.serviceIds.length > 0
    ? input.serviceIds
    : input.serviceId !== undefined
      ? [input.serviceId]
      : [];

  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of raw) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Hard cap on how many services one booking may hold.
 *
 * Not a business rule so much as a bound: without one, a crafted request could ask for five
 * hundred services and produce a booking that occupies the entire week. Eight is far more than
 * a real visit and cheap to raise.
 */
export const MAX_BASKET_LINES = 8;

/**
 * Build a basket from rows already fetched and already scoped to the right business.
 *
 * Takes rows rather than ids so the caller keeps ownership of the query — this file must not
 * become a second place that decides what "belongs to this business" means.
 *
 * Returns null when any requested id did not resolve. Deliberately all-or-nothing: silently
 * dropping one service would confirm a booking the customer did not ask for, at a price they
 * did not see.
 */
export function buildBasket(
  ids: number[],
  rows: Array<{ id: number; name: string; price: number | null; duration: number | null }>
): Basket | null {
  if (ids.length === 0 || ids.length > MAX_BASKET_LINES) return null;

  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const lines: BasketLine[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) return null;
    lines.push({
      serviceId: Number(row.id),
      name: String(row.name),
      // Snapshots, not references: a price rise next month must not rewrite what somebody was
      // charged today.
      price: Number(row.price || 0),
      duration: Number(row.duration || 0),
    });
  }

  return {
    lines,
    totalPrice: lines.reduce((sum, line) => sum + line.price, 0),
    totalDuration: lines.reduce((sum, line) => sum + line.duration, 0),
    primary: lines[0]!,
  };
}

/**
 * What the legacy `bookings.service_name` column should read.
 *
 * The two Telegram bots still select that column, so it has to say something sensible for a
 * multi-service booking. "Haircut +1" beats both a bare "Haircut", which hides half the visit,
 * and a full comma-separated list, which overflows a Telegram message where the column is used
 * inside a one-line summary.
 */
export function legacyServiceName(basket: Basket): string {
  const extra = basket.lines.length - 1;
  return extra > 0 ? `${basket.primary.name} +${extra}` : basket.primary.name;
}
