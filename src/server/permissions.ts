// What each role may do, in one table.
//
// Before this existed, "roles" were a localStorage switcher in the sidebar labelled
// "View as" — it filtered which nav items rendered and nothing else. Anyone signed in
// could set themselves back to owner with one click, and the server had no role in the
// session to check even if an endpoint had wanted to. Every endpoint was reachable by
// anyone holding the business login.
//
// The table is deliberately explicit rather than computed from a hierarchy. Reading down
// a column tells you exactly what a manager can do, which is the question you actually
// have when auditing this, and it makes adding a capability a decision per role instead
// of something that silently inherits.

import type { ActorRole } from "./auth";

export type Capability =
  /** Read the CRM payload at all. */
  | "crm:read"
  /** Move a booking through pending/confirmed/done/cancelled. */
  | "booking:status"
  /** Take a booking by hand — a phone call, or recording a walk-in. */
  | "booking:create"
  /** Record money in or out against a booking. */
  | "payment:write"
  /** Create, rename and delete staff rows. */
  | "staff:write"
  /** Edit weekly shifts, breaks and days off. */
  | "schedule:write"
  /** Create and edit the service catalogue and its prices. */
  | "service:write"
  /** Business name, address, hours, photo — the shop's public identity. */
  | "business:write"
  /** The business's own CRM login and password. */
  | "credentials:write"
  /** Grant, reset and revoke staff logins. Owner only, always. */
  | "access:manage";

const MATRIX: Record<ActorRole, Record<Capability, boolean>> = {
  owner: {
    "crm:read": true,
    "booking:status": true,
    "booking:create": true,
    "payment:write": true,
    "staff:write": true,
    "schedule:write": true,
    "service:write": true,
    "business:write": true,
    "credentials:write": true,
    "access:manage": true,
  },
  // Runs the shop day to day. Deliberately cannot touch the business identity, the
  // owner's password, or who else gets a login — a manager who could grant access could
  // promote themselves, which would make the whole distinction decorative.
  manager: {
    "crm:read": true,
    "booking:status": true,
    "booking:create": true,
    "payment:write": true,
    "staff:write": false,
    "schedule:write": true,
    "service:write": true,
    "business:write": false,
    "credentials:write": false,
    "access:manage": false,
  },
  // Sees their own day and marks their own clients as arrived. Money stays out: taking
  // payment is a till action, and letting a specialist record it removes the separation
  // that makes the finance numbers worth anything.
  specialist: {
    "crm:read": true,
    "booking:status": true,
    // Taking a booking means choosing who it lands on. A specialist working their own
    // day should not be assigning work to colleagues, so this stays with the desk.
    "booking:create": false,
    "payment:write": false,
    "staff:write": false,
    "schedule:write": false,
    "service:write": false,
    "business:write": false,
    "credentials:write": false,
    "access:manage": false,
  },
};

export function can(role: ActorRole, capability: Capability) {
  return MATRIX[role]?.[capability] === true;
}

/**
 * A specialist may only act on bookings that are theirs.
 *
 * Capability alone is not enough for booking:status — a specialist holds it, but holding
 * it must not let them cancel a colleague's appointments. Owners and managers are not
 * scoped, since running the calendar for everyone is the job.
 */
export function isScopedToOwnBookings(role: ActorRole) {
  return role === "specialist";
}
