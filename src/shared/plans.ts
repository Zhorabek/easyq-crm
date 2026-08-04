// Subscription plans, and which one to suggest.
//
// DUPLICATED, keep in sync (same rule as phone.ts):
//   easyq-crm/src/shared/plans.ts   <- source of truth
//
// Pure data and pure functions: no database, no Date.now() except where a caller passes the
// clock in. That is deliberate — "has this business paid" is the question that decides whether
// somebody can use the product, so it has to be answerable in a test without a database.

/** What a plan is called in the database. Never renamed — these are stored values. */
export type PlanId = "trial" | "p2" | "p5" | "p8" | "p15";

export type Plan = {
  id: PlanId;
  /** Largest team the plan covers. `trial` has no cap. */
  maxStaff: number;
  /** Monthly price in so'm. 0 for the trial. */
  price: number;
  /** The one marked with a star in the sales message. */
  featured: boolean;
};

/**
 * The paid tiers, cheapest first.
 *
 * Prices are the ones in the outreach message and nowhere else — if they change, they change
 * here and in `outreach/lib/messages.mjs`, which is the only other place they are written down.
 */
export const PAID_PLANS: Plan[] = [
  { id: "p2", maxStaff: 2, price: 175_000, featured: false },
  { id: "p5", maxStaff: 5, price: 299_000, featured: true },
  { id: "p8", maxStaff: 8, price: 499_000, featured: false },
  { id: "p15", maxStaff: 15, price: 799_000, featured: false },
];

/** Free month for every new business. */
export const TRIAL_DAYS = 30;

export function planById(id: string | null | undefined): Plan | null {
  return PAID_PLANS.find((plan) => plan.id === id) ?? null;
}

/**
 * Which plan to put in front of somebody, given how many people work there.
 *
 * The smallest tier that actually covers the team — recommending the 175k plan to a shop with
 * six staff would be recommending something they cannot use, and they would find that out
 * after paying.
 *
 * ## The floor: never recommend below the featured tier
 *
 * A one- or two-person shop technically fits inside p2 at 175k, and we still recommend p5. That
 * is a pricing decision, not a bug: p5 is the tier the business runs on, it is the one the
 * outreach message stars, and a two-person shop that hires a third person hits the p2 ceiling
 * within weeks and has to be moved anyway.
 *
 * p2 is still THERE and still selectable — a shop that wants the cheapest thing on the page can
 * take it in one tap. It is just not what we put the badge on.
 *
 * The featured tier is also the fallback for every case we cannot answer from data: no staff
 * added yet (which is most businesses on the day their trial ends), or a team larger than the
 * biggest plan, where the honest answer is a conversation rather than a button.
 */
export function recommendPlan(staffCount: number): Plan {
  const featured = PAID_PLANS.find((plan) => plan.featured)!;
  if (!Number.isFinite(staffCount) || staffCount <= 0) return featured;

  // Only tiers at or above the featured one are candidates, which is what keeps p2 off the
  // badge no matter how small the team is.
  const floor = PAID_PLANS.indexOf(featured);
  const fits = PAID_PLANS.slice(floor).find((plan) => staffCount <= plan.maxStaff);
  return fits ?? featured;
}

/** Does this team fit inside the plan? Used to mark tiers that are too small to pick. */
export function planCoversStaff(plan: Plan, staffCount: number): boolean {
  return !Number.isFinite(staffCount) || staffCount <= 0 || staffCount <= plan.maxStaff;
}

/* ---------------------------------------------------------------- the clock */

export type SubscriptionState = {
  /** `trial` until the free month runs out, then whatever was bought. */
  plan: PlanId;
  /** ISO date, exclusive: access ends at the START of this day. */
  expiresAt: string | null;
  active: boolean;
  /** Negative once it has lapsed. Null when there is no expiry recorded at all. */
  daysLeft: number | null;
  /** True only for a trial that has not been paid for yet. */
  onTrial: boolean;
};

/** Days between two ISO dates, positive when `to` is later. Null when either will not parse. */
function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/** `todayIso` + n days, as an ISO date. */
export function addDays(todayIso: string, days: number): string {
  const base = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(base)) return todayIso;
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Read a business's subscription as of `todayIso`.
 *
 * The date is passed in rather than read from the clock so this can be tested, and so the
 * Worker can use the SHOP's timezone — a subscription that lapses at midnight UTC would lapse
 * at five in the morning in Tashkent, which is a strange time to lock somebody out.
 *
 * A missing `expiresAt` counts as ACTIVE. Every business that predates this feature has null
 * there, and locking them all out on deploy would be a self-inflicted outage; the migration
 * backfills a date, and until it runs nothing changes for anyone.
 */
export function readSubscription(
  row: { plan?: string | null; plan_expires_at?: string | null },
  todayIso: string
): SubscriptionState {
  const plan = (row.plan as PlanId | undefined) ?? "trial";
  const expiresAt = row.plan_expires_at ?? null;

  if (!expiresAt) {
    return { plan, expiresAt: null, active: true, daysLeft: null, onTrial: plan === "trial" };
  }

  const daysLeft = daysBetween(todayIso, expiresAt);

  // A date that will not parse means the row is damaged, not that the shop stopped paying.
  // Reading it as "expired" would lock a paying customer out of their own calendar over a typo
  // in a column they cannot see. Same reasoning as the missing-date case above: this feature
  // must never be the reason somebody cannot work.
  if (daysLeft === null) {
    return { plan, expiresAt: null, active: true, daysLeft: null, onTrial: plan === "trial" };
  }

  return {
    plan,
    expiresAt,
    // Exclusive: on the expiry date itself the subscription is over. A month bought on the 3rd
    // runs to the 3rd of the next month, and that day is the first unpaid one.
    active: daysLeft > 0,
    daysLeft,
    onTrial: plan === "trial",
  };
}
