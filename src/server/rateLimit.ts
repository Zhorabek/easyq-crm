// Rate limiting, for the endpoints a stranger can reach.
//
// ## What this is for
//
// There was none. Every unauthenticated endpoint — login, sign-up, feedback, subdomain checks,
// public bookings — accepted unlimited requests. The only cap anywhere was three bookings per
// phone per day, which a script sidesteps by changing the phone.
//
// The sharpest case is login. It is unauthenticated, has no lockout, and every attempt costs
// the Worker 100_000 PBKDF2 iterations — twice, when a username falls through to the staff
// table. So it was both a brute-force surface and a way for a stranger to spend the account's
// CPU budget from a laptop.
//
// ## Fixed windows
//
// One row per bucket per window, incremented in place. A sliding window would mean a row per
// request and a scan per check, which for "stop a script hammering login" costs more than it
// buys. The trade is that an allowance can be spent at the end of one window and again at the
// start of the next, so the real short-term ceiling is roughly double the configured limit.
// That is still bounded, which is the whole point.
//
// ## Why it fails OPEN
//
// A limiter that 500s takes down the endpoint it protects, which is a worse outage than the
// abuse it prevents. More immediately: pushing to main deploys through Cloudflare's Git
// integration, and `rate_limit` does not exist until somebody runs the migration by hand — so
// on the first deploy every call here throws `no such table`. Failing open means that is a
// logged warning instead of a login outage.
//
// It does mean **the limiter does nothing until the migration is applied.** The warning below
// is deliberately unmissable for that reason.

export type RateLimitRule = {
  /** Bucket prefix, so two actions never share a counter. */
  action: string;
  /** How many requests are allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * The client's address, as Cloudflare sees it.
 *
 * `CF-Connecting-IP` is set by the edge and OVERWRITTEN on every request, so unlike
 * X-Forwarded-For it cannot be spoofed by the caller. Never trust XFF here — accepting it would
 * turn the limiter into a formality, since the attacker picks the header.
 *
 * Absent only off-Cloudflare (local dev), where everything shares one bucket. That is the safe
 * direction: it over-limits a single developer rather than under-limiting the internet.
 */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "local";
}

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds until the current window rolls over, for Retry-After. */
  retryAfter: number;
};

/**
 * Count one hit against `identifier` and say whether it is over the limit.
 *
 * The upsert and the read are one statement via RETURNING, so two concurrent requests cannot
 * both read the pre-increment value and both decide they are under the limit.
 */
export async function consumeRateLimit(
  db: D1Database,
  rule: RateLimitRule,
  identifier: string
): Promise<RateLimitVerdict> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;
  const retryAfter = windowStart + rule.windowSeconds - now;
  const bucket = `${rule.action}:${identifier}`;

  try {
    const row = await db
      .prepare(
        `INSERT INTO rate_limit (bucket, window_start, hits) VALUES (?, ?, 1)
         ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1
         RETURNING hits`
      )
      .bind(bucket, windowStart)
      .first<{ hits: number }>();

    // Defence against RETURNING coming back empty. Treating "no row" as one hit would disable
    // the limiter silently and look exactly like a quiet endpoint, so read the counter back
    // instead. Costs a second query only on a path that should never happen.
    const hits =
      row?.hits === undefined
        ? Number(
            (
              await db
                .prepare("SELECT hits FROM rate_limit WHERE bucket = ? AND window_start = ?")
                .bind(bucket, windowStart)
                .first<{ hits: number }>()
            )?.hits ?? 1
          )
        : Number(row.hits);

    // Purge on the transition INTO the over-limit state — once per bucket per window, rather
    // than on every request or on a random sample. Old windows are unreachable by key, so this
    // is housekeeping, not correctness; it must never fail the request.
    if (hits === rule.limit + 1) {
      await db
        .prepare("DELETE FROM rate_limit WHERE window_start < ?")
        .bind(windowStart - rule.windowSeconds)
        .run()
        .catch(() => undefined);
    }

    return { allowed: hits <= rule.limit, retryAfter };
  } catch (error) {
    console.warn(
      `RATE LIMITING IS OFF for ${rule.action}: the rate_limit table is unreachable, so this ` +
        "request was allowed through unchecked. Apply migrations/2026-08-03-rate-limit.sql. " +
        `(${error instanceof Error ? error.message : String(error)})`
    );
    return { allowed: true, retryAfter };
  }
}

/**
 * The limits themselves.
 *
 * Set to be invisible to a person and obstructive to a script. The login numbers are the ones
 * worth explaining: 20 attempts per five minutes per IP is far above anyone typing a password
 * they half-remember, and well below what makes guessing viable — and it is per IP rather than
 * global so one office behind a NAT cannot lock out another. The separate per-username bucket
 * is what stops a distributed attempt on ONE account, where every request comes from a
 * different address and no IP bucket ever fills.
 */
export const LIMITS = {
  loginPerIp: { action: "login:ip", limit: 20, windowSeconds: 300 },
  loginPerUser: { action: "login:user", limit: 10, windowSeconds: 300 },
  signup: { action: "signup", limit: 5, windowSeconds: 3600 },
  feedback: { action: "feedback", limit: 5, windowSeconds: 3600 },
  /**
   * Deliberately loose, and looser than it first looked right.
   *
   * An IP is a poor proxy for a person on this product's audience: Uzbek mobile carriers put
   * large numbers of subscribers behind CGNAT, so one address can be a whole neighbourhood
   * booking haircuts. At 10/hour a busy shop would have started refusing genuine customers
   * whose only mistake was sharing a carrier with the last nine.
   *
   * The precise control here is the existing cap of three bookings per phone per day, which is
   * enforced in publicBooking.ts and keyed on something an attacker has to actually own. This
   * limit is the blunt backstop behind it — it exists to stop one machine writing thousands of
   * rows, not to price individual customers, so it should sit far above any believable hour of
   * real trade.
   */
  publicBooking: { action: "booking", limit: 50, windowSeconds: 3600 },
  subdomainCheck: { action: "slugcheck", limit: 60, windowSeconds: 60 },
  verifyStart: { action: "verifystart", limit: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;
