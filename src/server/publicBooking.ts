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

import { bookableSlots, type ExistingBooking } from "../shared/availability";
import { isValidPhone, toStoragePhone } from "../shared/phone";
import { normalizeBookingFlow } from "../shared/bookingFlow";
import { buildBasket, legacyServiceName, requestedServiceIds, type Basket } from "../shared/basket";
import { DEFAULT_BRAND_COLOR, normalizeBrandColor, resolveBrandTheme } from "../shared/brand";
import type {
  CreatePublicBookingInput,
  PublicBusinessPayload,
  PublicReview,
  PublicService,
  PublicStaff,
} from "../types";

/** A client may not book further out than this. Keeps an open form from filling a year. */
const MAX_DAYS_AHEAD = 60;

/**
 * How many reviews each specialist shows, and how much of each.
 *
 * Two, because the specialist step is a list somebody is comparing — a wall of quotes under
 * every card stops being evidence and starts being scrolling. Long enough to carry a real
 * sentence, short enough that one essay cannot push the next specialist off the screen.
 */
const REVIEWS_PER_STAFF = 2;
const REVIEW_TEXT_LIMIT = 160;

/**
 * "Otabek Mirzayev" -> "Otabek M." — a first name and an initial, never the full name.
 *
 * The stored value came from Telegram's profile and was collected to identify a booking, not
 * to be published somewhere anyone can read it. Falls back to a generic label rather than
 * leaking whatever unexpected shape the column holds.
 */
function reviewAuthor(clientName: string | null): string {
  const parts = String(clientName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0].slice(0, 24);
  // A single-word name stays as it is; there is no surname to reduce to an initial.
  if (parts.length === 1) return first;
  return `${first} ${parts[1].slice(0, 1).toUpperCase()}.`;
}

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

type ServiceRow = { id: number; name: string; category: string | null; price: number; duration: number };
type StaffRow = { id: number; name: string; role: string | null; photo_file_id: string | null };

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
      `SELECT name, type, address, phone, schedule, description, photo_file_id, brand_color, brand_theme, booking_flow
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
      brand_color: string | null;
      brand_theme: string | null;
      booking_flow: string | null;
    }>();

  if (!business) return null;

  const [servicesRes, staffRes, imagesRes, linksRes, ratingsRes, reviewsRes] = await Promise.all([
    // Only is_active services. An archived service must not be bookable, even though the
    // owner still sees it in the CRM catalogue.
    db
      .prepare("SELECT id, name, category, price, duration FROM services WHERE business_id = ? AND is_active = 1 ORDER BY name ASC")
      .bind(businessId)
      .all<ServiceRow>(),
    db.prepare("SELECT id, name, role, photo_file_id FROM staff WHERE business_id = ? ORDER BY name ASC").bind(businessId).all<StaffRow>(),
    // Ids only, never the blobs: this decides whether to render an <img>, and the page
    // fetches the bytes per specialist from /api/public/staff/<id>/photo.
    // .catch for the same reason as storedImageIds in worker.ts: this is the public booking
    // page, and an absent crm_images table must cost photos, not the whole page.
    db.prepare("SELECT staff_id FROM crm_images WHERE business_id = ?").bind(businessId)
      .all<{ staff_id: number }>().catch(() => ({ results: [] as Array<{ staff_id: number }> })),
    db
      .prepare(
        `SELECT ss.staff_id, ss.service_id
         FROM staff_services ss
         INNER JOIN staff st ON st.id = ss.staff_id
         WHERE st.business_id = ?`
      )
      .bind(businessId)
      .all<{ staff_id: number; service_id: number }>(),
    /**
     * Per-specialist ratings, aggregated in SQL rather than by reading every review.
     *
     * `idx_reviews_staff` is (staff_id, approved) and exists for exactly this. Grouping in the
     * Worker instead would put every review a busy shop has ever received on the wire for a
     * page that renders one number per person.
     *
     * No `approved` filter, deliberately: the average counts every rating, matching both the
     * CRM's Reviews screen and the client bot's specialist card. Moderation gates TEXT — which
     * this payload does not carry — and a score that waited for it would mean a shop with forty
     * honest ratings showing none, and the same specialist rated differently on the web page
     * and in Telegram.
     *
     * `.catch` for the same reason as crm_images above: this is the public booking page, and a
     * reviews table that is missing or mid-migration must cost stars, not the whole page.
     */
    db
      .prepare(
        `SELECT staff_id, AVG(rating) AS average, COUNT(*) AS total
           FROM reviews
          WHERE business_id = ? AND staff_id IS NOT NULL
          GROUP BY staff_id`
      )
      .bind(businessId)
      .all<{ staff_id: number; average: number | null; total: number }>()
      .catch(() => ({ results: [] as Array<{ staff_id: number; average: number | null; total: number }> })),
    /**
     * The two newest APPROVED reviews per specialist that actually have words.
     *
     * `approved = 1` here and deliberately nowhere in the average above: a score is a number
     * and cannot libel anyone, but this is text a stranger wrote, and the moderation queue
     * exists precisely so none of it reaches a public page unread.
     *
     * `text <> ''` because most reviews are a star tap with no words — the bot asks afterwards
     * and most people skip. Those belong in the average, not in a list of quotes.
     *
     * ROW_NUMBER partitions per specialist rather than taking a flat `LIMIT` over the business:
     * a flat limit would let one popular barber's reviews fill the allowance and leave every
     * colleague showing none.
     */
    db
      .prepare(
        `SELECT id, staff_id, rating, text, client_name FROM (
           SELECT id, staff_id, rating, text, client_name,
                  ROW_NUMBER() OVER (PARTITION BY staff_id ORDER BY id DESC) AS rn
             FROM reviews
            WHERE business_id = ? AND staff_id IS NOT NULL AND approved = 1 AND text <> ''
         ) WHERE rn <= ?
         ORDER BY staff_id ASC, id DESC`
      )
      .bind(businessId, REVIEWS_PER_STAFF)
      .all<{ id: number; staff_id: number; rating: number; text: string; client_name: string | null }>()
      .catch(() => ({ results: [] as Array<{ id: number; staff_id: number; rating: number; text: string; client_name: string | null }> })),
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

  /**
   * Services somebody can actually perform.
   *
   * A service with nobody assigned is not bookable: there is no specialist to give it to and
   * no shift to place it in. It used to be offered anyway, and the page filled the specialist
   * step with the entire team — so a customer could book "haircut" with the one barber who is
   * only assigned to beard trims. Dropping it here means the page cannot present a choice that
   * leads nowhere, and the owner sees the same fact in the CRM services table.
   *
   * The trade-off is deliberate: a shop that has assigned nobody to anything gets an empty
   * booking page. That is the truth about what can be booked, and the CRM says why.
   */
  const publicServices: PublicService[] = services
    .map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category?.trim() || "",
      price: Number(service.price || 0),
      duration: Number(service.duration || 0),
      staffIds: staffIdsByService.get(service.id) ?? [],
    }))
    .filter((service) => service.staffIds.length > 0);

  const imageIds = new Set((imagesRes.results ?? []).map((r) => Number(r.staff_id)));

  // staff id -> { average, total }. Built once so the map below is a lookup rather than a scan
  // per specialist.
  // staff id -> their published quotes, already ordered newest-first by the query.
  const reviewsByStaff = new Map<number, PublicReview[]>();
  for (const row of (reviewsRes.results ?? []) as Array<{ id: number; staff_id: number; rating: number; text: string; client_name: string | null }>) {
    const list = reviewsByStaff.get(Number(row.staff_id)) ?? [];
    list.push({
      id: Number(row.id),
      rating: Number(row.rating || 0),
      // Trimmed server-side so the wire never carries more than the card can show. An ellipsis
      // rather than a hard cut, so a clipped sentence looks clipped rather than broken.
      text: row.text.length > REVIEW_TEXT_LIMIT ? row.text.slice(0, REVIEW_TEXT_LIMIT - 1).trimEnd() + '…' : row.text,
      author: reviewAuthor(row.client_name),
    });
    reviewsByStaff.set(Number(row.staff_id), list);
  }

  const ratingByStaff = new Map<number, { average: number | null; total: number }>();
  for (const row of (ratingsRes.results ?? []) as Array<{ staff_id: number; average: number | null; total: number }>) {
    ratingByStaff.set(Number(row.staff_id), { average: row.average, total: Number(row.total || 0) });
  }

  const publicStaff: PublicStaff[] = staff.map((person) => {
    const rated = ratingByStaff.get(person.id);
    const ratingCount = Number(rated?.total ?? 0);
    return {
    id: person.id,
    name: person.name,
    // The owner's role wins over the first service name — a client reading "Barber" is
    // better served than one reading "Стрижка", which is what they are booking anyway.
    role: person.role?.trim() || serviceNamesByStaff.get(person.id)?.[0] || "",
    // A flag, not a URL: the page builds /api/public/staff/<id>/photo itself, and sending a
    // file_id to an unauthenticated caller would leak a token that fetches from Telegram.
    hasPhoto: imageIds.has(person.id) || Boolean(person.photo_file_id),
    // Null, not 0, when nobody has rated them: 0 is a score, and a specialist who has simply
    // never been rated must not render as the worst one on the page.
    rating: ratingCount > 0 && rated?.average != null ? Number(Number(rated.average).toFixed(1)) : null,
    ratingCount,
    reviews: reviewsByStaff.get(person.id) ?? [],
    };
  });

  return {
    name: business.name,
    type: business.type,
    address: business.address,
    phone: business.phone,
    schedule: business.schedule,
    description: business.description,
    // 0 is the logo's slot in crm_images; the old Telegram file_id still counts.
    hasPhoto: imageIds.has(0) || Boolean(business.photo_file_id),
    // Resolved here so the page never has to decide what "no colour" means.
    brandColor: normalizeBrandColor(business.brand_color ?? "") ?? DEFAULT_BRAND_COLOR,
    // Falls back through theme -> accent on the default page -> easyQ, so a business that
    // picked a colour before themes existed renders exactly as it did.
    brandTheme: resolveBrandTheme(business.brand_theme, business.brand_color),
    // Decides which steps this page shows and in what order. Normalised server-side so an
    // unrecognised value degrades to the original service-then-specialist flow.
    bookingFlow: normalizeBookingFlow(business.booking_flow),
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
  nowIsoMinute: string | null,
  /**
   * Duration of the service being booked, so a slot is only offered when the whole service
   * fits. Null falls back to a single slot, which is what a caller with no service chosen
   * yet should see.
   */
  serviceDurationMinutes: number | null = null
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
        `SELECT datetime, duration_snapshot FROM bookings
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
  const bookings = ((bookedRes.results ?? []) as unknown as Array<{ datetime: string; duration_snapshot: number | null }>).map(
    (row) => ({
      time: row.datetime.replace("T", " ").slice(11, 16),
      durationMinutes: row.duration_snapshot,
    })
  ) satisfies ExistingBooking[];

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

  const slots = bookableSlots({ shiftSlots, weeklyBreaks, dayOff, bookings, serviceDurationMinutes });

  // Today's already-passed slots are not bookable. `nowIsoMinute` is the business's local
  // "HH:MM" and is null for future dates, where no filtering applies.
  return nowIsoMinute ? slots.filter((slot) => slot > nowIsoMinute) : slots;
}

export type CreateBookingResult =
  | { ok: true; bookingId: number; serviceName: string; staffName: string; price: number }
  | { ok: false; error: PublicBookingError };

/**
 * Write one row per chosen service.
 *
 * Batched rather than looped: D1 round trips dominate here, and a four-service booking should
 * not cost four sequential writes. Failure leaves the booking with no lines rather than
 * half — callers read the legacy columns as a fallback, so the booking is still coherent.
 */
export async function writeBasketLines(db: D1Database, bookingId: number, basket: Basket) {
  if (!bookingId) return;
  await db.batch(
    basket.lines.map((line, index) =>
      db
        .prepare(
          `INSERT INTO booking_services (booking_id, service_id, service_name, price, duration, position)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(bookingId, line.serviceId, line.name, line.price, line.duration, index)
    )
  );
}

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

  const wanted = requestedServiceIds(input);
  if (wanted.length === 0) return { ok: false, error: "invalid_service" };

  // Both scoped to businessId, so ids from another shop simply do not resolve. The IN list is
  // built from the count, never from the values, so the ids stay bound parameters.
  const placeholders = wanted.map(() => "?").join(", ");
  const [serviceRows, staff] = await Promise.all([
    db
      .prepare(`SELECT id, name, price, duration FROM services WHERE business_id = ? AND is_active = 1 AND id IN (${placeholders})`)
      .bind(businessId, ...wanted)
      .all<ServiceRow>(),
    db
      .prepare("SELECT id, name FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
      .bind(Number(input.staffId), businessId)
      .first<StaffRow>(),
  ]);

  // All-or-nothing: silently dropping one service would confirm a booking the customer did not
  // ask for, at a price they were never shown.
  const basket = buildBasket(wanted, serviceRows.results ?? []);
  if (!basket) return { ok: false, error: "invalid_service" };
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
  // Same duration the client was shown, so the re-check applies the identical rule. Passing
  // nothing here would validate against single-slot availability and let an overlapping
  // long service through the very check meant to stop it.
  const free = await getPublicSlots(
    db,
    businessId,
    staff.id,
    date,
    date === todayIso ? nowIsoMinute : null,
    // The TOTAL, not the first line. Two 30-minute services back to back need a one-hour
    // block, and reserving half of it is how a shop gets double-booked at half past.
    basket.totalDuration
  );
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
      // The legacy single-service columns still carry the FIRST service and the TOTAL price
      // and duration, because both Telegram bots read them by name and deploy separately.
      // Wrong in detail for a multi-service visit, never broken — and booking_services below
      // holds the full picture for anything that can read it.
      basket.primary.serviceId,
      staff.id,
      clientName,
      clientPhone,
      legacyServiceName(basket),
      staff.name,
      `${date} ${time}:00`,
      basket.totalPrice,
      basket.totalDuration || null,
      String(input.notes ?? "").trim().slice(0, 500) || null
    )
    .run();

  const bookingId = Number(insert.meta.last_row_id ?? 0);
  await writeBasketLines(db, bookingId, basket);

  return {
    ok: true,
    bookingId,
    // What the confirmation screen shows. The joined names rather than the legacy "+1" form,
    // because here there is room to read them and the customer should see what they booked.
    serviceName: basket.lines.map((line) => line.name).join(" · "),
    staffName: staff.name,
    price: basket.totalPrice,
  };
}
