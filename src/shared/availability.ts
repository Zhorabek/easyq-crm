// Which of a staff member's slots are open on a given day.
//
// This is the ONE definition, deliberately. It is used by getCrmPayload (the owner's
// calendar) and by the public booking API. Two copies of these rules would drift, and
// the failure mode is not cosmetic: the booking page would offer a slot the calendar
// considers blocked, or take a booking on a day off.
//
// THE DATA MODEL
//   staff_slots            the recurring shift — (weekday, slot_time) rows
//   staff_unavailability   two kinds of hole in that shift:
//                            kind='break'    (weekday, slot_time)  recurring, every week
//                            kind='day_off'  (date, ...)           one specific date,
//                                            either is_full_day=1 or particular slots
//
// SLOTS ARE ATOMIC. A service has a `duration`, but nothing in this system lets a
// 90-minute booking consume the slot after it — one slot holds one booking whatever its
// length. That is existing behaviour across the bots and the CRM, so it is preserved
// here rather than quietly changed; changing it is a scheduling decision, not a
// refactor, and it would have to change everywhere at once.

export type DayOff = { isFullDay: boolean; slots: string[] };

export type AvailabilityInput = {
  /** slot_time values rostered for this weekday. */
  shiftSlots: string[];
  /** Recurring breaks for this weekday. */
  weeklyBreaks: string[];
  /** The day_off entry for this exact date, if any. */
  dayOff: DayOff | undefined;
};

/**
 * Slots the staff member is rostered and not blocked for — before bookings.
 *
 * A full-day day_off empties the day outright; that is why its `slots` are ignored in
 * that case, since "off all day" already covers them.
 */
export function openShiftSlots({ shiftSlots, weeklyBreaks, dayOff }: AvailabilityInput): string[] {
  if (dayOff?.isFullDay) return [];

  const blocked = new Set<string>([...weeklyBreaks, ...(dayOff?.slots ?? [])]);
  return shiftSlots.filter((slot) => !blocked.has(slot));
}

/**
 * Slots a client can actually book: rostered, not blocked, not already taken.
 *
 * `bookedTimes` must exclude cancelled bookings — a cancelled slot is free again.
 */
export function bookableSlots(input: AvailabilityInput & { bookedTimes: string[] }): string[] {
  const taken = new Set(input.bookedTimes);
  return openShiftSlots(input).filter((slot) => !taken.has(slot));
}
