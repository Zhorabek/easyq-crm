/**
 * What a customer is asked for on the booking page, and in what order.
 *
 * One definition, shared by the Worker that validates the saved value, the CRM that offers
 * the choice, and the booking page that obeys it. Three files agreeing by coincidence is how
 * a fourth value gets stored and then rendered as a blank page.
 */

export type BookingFlow =
  /** Service, then specialist. What every business had before this existed. */
  | "service_first"
  /** Specialist, then service — for shops where people come back to one person. */
  | "staff_first"
  /** Service only. The specialist is assigned and never shown to the customer. */
  | "service_only";

export const BOOKING_FLOWS: BookingFlow[] = ["service_first", "staff_first", "service_only"];

/**
 * `service_first` for anything unrecognised, including null.
 *
 * The default is load-bearing rather than defensive: the column is nullable and nothing was
 * backfilled, so every business that existed before this feature reads as NULL and must keep
 * the page it already had. A typo in the database therefore degrades to today's behaviour
 * instead of to an empty step.
 */
export const DEFAULT_BOOKING_FLOW: BookingFlow = "service_first";

export function normalizeBookingFlow(value: unknown): BookingFlow {
  return typeof value === "string" && (BOOKING_FLOWS as string[]).includes(value)
    ? (value as BookingFlow)
    : DEFAULT_BOOKING_FLOW;
}

/** Whether the customer picks their specialist. False only for `service_only`. */
export function flowShowsStaff(flow: BookingFlow) {
  return flow !== "service_only";
}

/** Whether the specialist is chosen BEFORE the service. */
export function flowStaffFirst(flow: BookingFlow) {
  return flow === "staff_first";
}
