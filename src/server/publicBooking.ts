// The public booking page's data layer.
//
// Everything here is UNAUTHENTICATED and reached by anyone who knows a business's
// subdomain. Two rules follow from that and are load-bearing:
//
//   1. Every query is scoped by the businessId the HOST resolved to — never by an id
//      from the request. A `businessId` parameter in the body would let one shop's
//      booking page write bookings into another's.
//   2. Nothing here returns data a stranger should not see. Client names, revenue,
//      payment history and staff phone numbers all stay out; a caller gets the shop's
//      public details, its active services, its staff, and free slot times.

import { bookableSlots } from "../shared/availability";
import { isValidPhone, toStoragePhone } from "../shared/phone";
import type {
  CreatePublicBookingInput,
  PublicBusinessPayload,
  PublicService,
  PublicStaff,
} from "../types";

/** A client may not book further out than this. Keeps an open form from filling a year. */
const MAX_DAYS_AHEAD = 60;

/** Per-phone cap per business per day, so one number cannot flood a shop's calendar. */
const MAX_BOOKINGS_PER_PHONE_PER_DAY = 3;

export type PublicBookingError =
  | "invalid_service"
  | "invalid_staff"
  | "invalid_date"
  | "past_date"
  | "too_far_ahead"
  | "invalid_time"
  | "slot_taken"
  | "invalid_name"
  | "invalid_phone"
  | "rate_limited";

type ServiceRow = { id: number; name: string; price: number; duration: number };
type StaffRow = { id: number; name: string; role: string | null };

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Weekday for an ISO date, computed from the parts rather than Date.getDay().
 *
 * `new Date("2026-07-28T00:00:00")` is parsed in the RUNTIME's zone — UTC on Workers —
 * so near midnight it can land on the previous day and shift the whole roster by one.
 * Zeller-style arithmetic on the literal date has no timezone at all.
 */
export function weekdayForIsoDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const shiftedYear = m < 3 ? y - 1 : y;
  const monthTerm = m < 3 ? m + 12 : m;
  const k = shiftedYear % 100;
  const j = Math.floor(shiftedYear / 100);
  const h =
    (d +
      Math.floor((13 * (monthTerm + 1)) / 5) +
      k +
      Math.floor(k / 4) +
      Math.floor(j / 4) +
      5 * j) %
    7;
  // Zeller yields 0=Saturday; the schema uses 0=Sunday to match SQLite's strftime('%w').
  return (h + 6) % 7;
}

export async function getPublicBusiness(
  db: D1Database,
  businessId: number,
  timeZone: string,
  today: string
): Promise<PublicBusinessPayload | null> {
  const business = await db
    .prepare(
      `SELECT name, type, address, phone, schedule, description, photo_file_id
       FROM businesses WHERE id = ? LIMIT 1`
    )
    .bind(businessId)
    .first<{
      name: string;
      type: string;
      address: string;
      phone: string;
      schedule: string;
      description: string | null;
      photo_file_id: string | null;
    }>();

  if (!business) return null;

  const [servicesRes, staffRes, linksRes] = await Promise.all([
    // Only is_active services. An archived service must not be bookable, even though the
    // owner still sees it in the CRM catalogue.
    db
      .prepare("SELECT id, name, price, duration FROM services WHERE business_id = ? AND is_active = 1 ORDER BY name ASC")
      .bind(businessId)
      .all<ServiceRow>(),
    db.prepare("SELECT id, name, role FROM staff WHERE business_id = ? ORDER BY name ASC").bind(businessId).all<StaffRow>(),
    db
      .prepare(
        `SELECT ss.staff_id, ss.service_id
         FROM staff_services ss
         INNER JOIN staff st ON st.id = ss.staff_id
         WHERE st.business_id = ?`
      )
      .bind(businessId)
      .all<{ staff_id: number; service_id: number }>(),
  ]);

  const services = (servicesRes.results ?? []) as unknown as ServiceRow[];
  const staff = (staffRes.results ?? []) as unknown as StaffRow[];
  const links = (linksRes.results ?? []) as unknown as Array<{ staff_id: number; service_id: number }>;

  const staffIdsByService = new Map<number, number[]>();
  const serviceNamesByStaff = new Map<number, string[]>();
  const serviceNameById = new Map(services.map((service) => [service.id, service.name]));

  for (const link of links) {
    const forService = staffIdsByService.get(link.service_id) ?? [];
    if (!forService.includes(link.staff_id)) {
      forService.push(link.staff_id);
      staffIdsByService.set(link.service_id, forService);
    }

    const name = serviceNameById.get(link.service_id);
    if (name) {
      const forStaff = serviceNamesByStaff.get(link.staff_id) ?? [];
      if (!forStaff.includes(name)) {
        forStaff.push(name);
        serviceNamesByStaff.set(link.staff_id, forStaff);
      }
    }
  }

  const publicServices: PublicService[] = services.map((service) => ({
    id: service.id,
    name: service.name,
    price: Number(service.price || 0),
    duration: Number(service.duration || 0),
    staffIds: staffIdsByService.get(service.id) ?? [],
  }));

  const publicStaff: PublicStaff[] = staff.map((person) => ({
    id: person.id,
    name: person.name,
    // The owner's role wins over the first service name — a client reading "Barber" is
    // better served than one reading "Стрижка", which is what they are booking anyway.
    role: person.role?.trim() || serviceNamesByStaff.get(person.id)?.[0] || "",
  }));

  return {
    name: business.name,
    type: business.type,
    address: business.address,
    phone: business.phone,
    schedule: business.schedule,
    description: business.description,
    hasPhoto: Boolean(business.photo_file_id),
    services: publicServices,
    staff: publicStaff,
    timeZone,
    today,
  };
}

/**
 * Free slot times for one staff member on one date.
 *
 * Returns [] rather than an error for a staff member who does not belong to this
 * business — a public endpoint should not confirm which ids exist elsewhere.
 */
export async function getPublicSlots(
  db: D1Database,
  businessId: number,
  staffId: number,
  date: string,
  nowIsoMinute: string | null
): Promise<string[]> {
  const staff = await db
    .prepare("SELECT id FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(staffId, businessId)
    .first<{ id: number }>();
  if (!staff) return [];

  const weekday = weekdayForIsoDate(date);

  const [shiftRes, blockRes, bookedRes] = await Promise.all([
    db
      .prepare("SELECT slot_time FROM staff_slots WHERE staff_id = ? AND weekday = ? ORDER BY slot_time ASC")
      .bind(staffId, weekday)
      .all<{ slot_time: string }>(),
    db
      .prepare(
        `SELECT kind, weekday, date, slot_time, is_full_day
         FROM staff_unavailability
         WHERE staff_id = ? AND ((weekday = ? AND date IS NULL) OR date = ?)`
      )
      .bind(staffId, weekday, date)
      .all<{ kind: string; weekday: number | null; date: string | null; slot_time: string | null; is_full_day: number }>(),
    // datetime is stored as either "YYYY-MM-DD HH:MM:SS" or with a "T"; match on the
    // date prefix in both shapes rather than assuming one.
    db
      .prepare(
        `SELECT datetime FROM bookings
         WHERE staff_id = ? AND business_id = ? AND status != 'cancelled'
           AND (datetime LIKE ? OR datetime LIKE ?)`
      )
      .bind(staffId, businessId, `${date} %`, `${date}T%`)
      .all<{ datetime: string }>(),
  ]);

  const shiftSlots = ((shiftRes.results ?? []) as unknown as Array<{ slot_time: string }>).map((row) => row.slot_time);
  const blocks = (blockRes.results ?? []) as unknown as Array<{
    date: string | null;
    slot_time: string | null;
    is_full_day: number;
  }>;
  const booked = ((bookedRes.results ?? []) as unknown as Array<{ datetime: string }>).map((row) =>
    row.datetime.replace("T", " ").slice(11, 16)
  );

  const weeklyBreaks: string[] = [];
  let dayOff: { isFullDay: boolean; slots: string[] } | undefined;
  for (const block of blocks) {
    if (block.date) {
      dayOff = dayOff ?? { isFullDay: false, slots: [] };
      if (Number(block.is_full_day) === 1) dayOff.isFullDay = true;
      else if (block.slot_time) dayOff.slots.push(block.slot_time);
    } else if (block.slot_time) {
      weeklyBreaks.push(block.slot_time);
    }
  }

  const slots = bookableSlots({ shiftSlots, weeklyBreaks, dayOff, bookedTimes: booked });

  // Today's already-passed slots are not bookable. `nowIsoMinute` is the business's local
  // "HH:MM" and is null for future dates, where no filtering applies.
  return nowIsoMinute ? slots.filter((slot) => slot > nowIsoMinute) : slots;
}

export type CreateBookingResult =
  | { ok: true; bookingId: number; serviceName: string; staffName: string; price: number }
  | { ok: false; error: PublicBookingError };

export async function createPublicBooking(
  db: D1Database,
  businessId: number,
  input: CreatePublicBookingInput,
  todayIso: string,
  nowIsoMinute: string
): Promise<CreateBookingResult> {
  const clientName = String(input.clientName ?? "").trim().slice(0, 80);
  if (clientName.length < 2) return { ok: false, error: "invalid_name" };

  if (!isValidPhone(String(input.clientPhone ?? ""))) return { ok: false, error: "invalid_phone" };
  const clientPhone = toStoragePhone(String(input.clientPhone))!;

  const date = String(input.date ?? "");
  if (!isIsoDate(date)) return { ok: false, error: "invalid_date" };
  if (date < todayIso) return { ok: false, error: "past_date" };

  const maxDate = new Date(`${todayIso}T00:00:00Z`);
  maxDate.setUTCDate(maxDate.getUTCDate() + MAX_DAYS_AHEAD);
  if (date > maxDate.toISOString().slice(0, 10)) return { ok: false, error: "too_far_ahead" };

  const time = String(input.time ?? "");
  if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "invalid_time" };
  if (date === todayIso && time <= nowIsoMinute) return { ok: false, error: "invalid_time" };

  // Both scoped to businessId, so ids from another shop simply do not resolve.
  const [service, staff] = await Promise.all([
    db
      .prepare("SELECT id, name, price, duration FROM services WHERE id = ? AND business_id = ? AND is_active = 1 LIMIT 1")
      .bind(Number(input.serviceId), businessId)
      .first<ServiceRow>(),
    db
      .prepare("SELECT id, name FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
      .bind(Number(input.staffId), businessId)
      .first<StaffRow>(),
  ]);
  if (!service) return { ok: false, error: "invalid_service" };
  if (!staff) return { ok: false, error: "invalid_staff" };

  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE business_id = ? AND client_phone = ? AND status != 'cancelled'
         AND (datetime LIKE ? OR datetime LIKE ?)`
    )
    .bind(businessId, clientPhone, `${date} %`, `${date}T%`)
    .first<{ n: number }>();
  if (Number(recent?.n ?? 0) >= MAX_BOOKINGS_PER_PHONE_PER_DAY) {
    return { ok: false, error: "rate_limited" };
  }

  // Re-check availability immediately before writing. The client picked from a list that
  // may be seconds stale, and this is the last point at which a double-booking can be
  // caught. It is not a true lock — D1 has no row locking here — but it closes the window
  // from "however long the form was open" down to a few milliseconds.
  const free = await getPublicSlots(db, businessId, staff.id, date, date === todayIso ? nowIsoMinute : null);
  if (!free.includes(time)) return { ok: false, error: "slot_taken" };

  const insert = await db
    .prepare(
      `INSERT INTO bookings
         (business_id, user_id, service_id, staff_id, client_name, client_phone, service_name, staff_name,
          datetime, status, price_snapshot, duration_snapshot, notes)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
    .bind(
      businessId,
      service.id,
      staff.id,
      clientName,
      clientPhone,
      service.name,
      staff.name,
      `${date} ${time}:00`,
      Number(service.price || 0),
      Number(service.duration || 0) || null,
      String(input.notes ?? "").trim().slice(0, 500) || null
    )
    .run();

  return {
    ok: true,
    bookingId: Number(insert.meta.last_row_id ?? 0),
    serviceName: service.name,
    staffName: staff.name,
    price: Number(service.price || 0),
  };
}
