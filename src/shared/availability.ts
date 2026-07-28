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

/** An appointment already on the books. `durationMinutes` may be null on legacy rows. */
export type ExistingBooking = { time: string; durationMinutes: number | null };

/** Slot grid granularity. staff_slots are rostered on the half hour. */
export const SLOT_STEP_MINUTES = 30;

function toMinutes(time: string) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Round a duration up to whole slots. A 45-minute service occupies two 30-minute slots,
 * because half a slot cannot be sold to anybody else.
 */
function slotsNeeded(durationMinutes: number | null | undefined) {
  const minutes = Number(durationMinutes ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return 1;
  return Math.max(1, Math.ceil(minutes / SLOT_STEP_MINUTES));
}

/**
 * Slots a client can actually book, accounting for how long things take.
 *
 * The old version compared start times only, so a 60-minute appointment at 11:00 left
 * 10:30 on sale and two clients arrived half an hour apart for the same chair.
 *
 * A slot is offered only when the WHOLE service fits: every half-hour step it would
 * occupy must be rostered, unblocked, and unoccupied. One rule covers three cases that
 * would otherwise each need their own check —
 *   • an existing appointment overlapping any part of the new one,
 *   • a break landing mid-service,
 *   • a service overrunning the end of the shift, since the steps past closing are simply
 *     not in the open set.
 *
 * `bookings` must exclude cancelled appointments — a cancelled slot is free again.
 *
 * SCOPE: this governs the CRM and the web booking page. The Telegram bots compute their
 * own availability in their own repository and still compare start times only, so a bot
 * booking can still overlap. Fixing that means changing the bots too.
 */
export function bookableSlots(
  input: AvailabilityInput & {
    bookings: ExistingBooking[];
    /** Duration of the service being booked. Omitted or 0 means a single slot. */
    serviceDurationMinutes?: number | null;
  }
): string[] {
  const open = openShiftSlots(input);
  const openMinutes = new Set(open.map(toMinutes));

  // Every half-hour an existing appointment occupies, not just where it starts.
  const occupied = new Set<number>();
  for (const booking of input.bookings) {
    const start = toMinutes(booking.time);
    if (!Number.isFinite(start)) continue;
    for (let i = 0; i < slotsNeeded(booking.durationMinutes); i += 1) {
      occupied.add(start + i * SLOT_STEP_MINUTES);
    }
  }

  const needed = slotsNeeded(input.serviceDurationMinutes);

  return open.filter((slot) => {
    const start = toMinutes(slot);
    for (let i = 0; i < needed; i += 1) {
      const step = start + i * SLOT_STEP_MINUTES;
      if (!openMinutes.has(step) || occupied.has(step)) return false;
    }
    return true;
  });
}
