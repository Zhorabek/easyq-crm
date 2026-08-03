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
    // A master takes their own bookings — a regular calls them directly, or walks in — and
    // the alternative was that work never reached the CRM at all.
    //
    // This was false, on the reasoning that taking a booking means choosing who it lands on
    // and a specialist should not assign work to colleagues. That reasoning was right about
    // the risk and wrong about the fix: the risk is the TARGET of the booking, not the act
    // of creating one. So the capability opens and `isScopedToOwnBookings` closes the hole —
    // createCrmBooking overwrites staff_id with the actor's own for any scoped role, so a
    // specialist cannot land a booking on anyone but themselves whatever they send.
    "booking:create": true,
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
 *
 * The same scoping is what makes booking:create safe to grant them: on create there is no
 * existing row to check ownership against, so the server assigns the staff id rather than
 * validating the one it was sent.
 */
export function isScopedToOwnBookings(role: ActorRole) {
  // Written as "who is NOT scoped" on purpose. `role === "specialist"` reads the same today and
  // fails in opposite directions: under it, a role added tomorrow is unscoped — it sees every
  // colleague's calendar and client list — until somebody remembers to come back here. Listing
  // the exemptions instead means a new role starts scoped to itself, which is the same default
  // the capability matrix already gives it.
  //
  // Running the calendar for everyone is the job for these two, so the list is not likely to
  // grow; if it does, that is a deliberate line to add rather than an omission.
  return role !== "owner" && role !== "manager";
}
