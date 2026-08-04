import type { BookingFlow } from './shared/bookingFlow';

export type BookingStatus = "pending" | "confirmed" | "done" | "cancelled";
export type AppSection = "overview" | "calendar" | "employees" | "services" | "clients" | "analytics" | "booking" | "profile";
export type PaymentMethod = "cash" | "card" | "transfer" | "other";
export type PaymentFlow = "in" | "out";
export type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

export interface BusinessProfile {
  id: number;
  name: string;
  type: string;
  address: string;
  phone: string;
  schedule: string;
  description: string | null;
  photoFileId: string | null;
  photoFileUniqueId: string | null;
  /** What the booking page asks for, and in what order. See shared/bookingFlow.ts. */
  bookingFlow: BookingFlow;
  crmUsername: string | null;
  crmHasTemporaryPassword: boolean;
  /** Chosen accent as `#rrggbb`, or null to use the easyQ default. */
  brandColor: string | null;
  /**
   * Chosen page theme, or null when the business has never picked one — in which case
   * `brandColor` on the default page is still the answer. Resolved by resolveBrandTheme.
   */
  brandTheme: BrandThemeValue | null;
}

/** Mirror of `BrandTheme` in shared/brand.ts, kept here so types.ts imports nothing. */
export interface BrandThemeValue {
  bg: string;
  ink: string;
  accent: string;
}

/** Permission level. The owner is the business account; the rest are staff logins. */
export type ActorRole = "owner" | "manager" | "specialist";

export interface AuthSession {
  businessId: number;
  businessName: string;
  username: string;
  isTemporaryPassword: boolean;
  /** Subdomain label — this business's CRM lives at `<slug>.easyq.uz`. */
  slug: string | null;
  /**
   * Resolved server-side from the signed cookie and re-checked against the staff row on
   * every request. The UI uses it to hide what the user cannot do — but the hiding is
   * cosmetic; server/permissions.ts is what actually enforces it.
   */
  role: ActorRole;
  /** Null for the owner, who has no staff row. */
  staffId: number | null;
  staffName: string | null;
}

/** One staff member's CRM access, for the owner's Team & access screen. */
/** One tier on the plan picker. */
export interface PlanOption {
  id: string;
  maxStaff: number;
  price: number;
  featured: boolean;
  /** False when the team is already bigger than this tier allows. */
  fitsTeam: boolean;
  /** The one suggested for this shop's team size. */
  recommended: boolean;
}

export interface SubscriptionInfo {
  plan: string;
  active: boolean;
  onTrial: boolean;
  expiresAt: string | null;
  /** Negative once lapsed, null when there is no expiry recorded. */
  daysLeft: number | null;
  /** How many staff the recommendation was based on. */
  staffCount: number;
  plans: PlanOption[];
}

export interface StaffAccessRow {
  staffId: number;
  name: string;
  username: string | null;
  accessRole: "manager" | "specialist" | null;
  enabled: boolean;
  hasTemporaryPassword: boolean;
}

export interface KpiCard {
  id: string;
  /**
   * An i18n KEY, never text.
   *
   * These four cards shipped Russian strings straight from the Worker and the dashboard
   * rendered them verbatim, so an owner working in Uzbek opened their main screen and read
   * "Записи на сегодня". Same mistake bookingLinks already fixed, on the more visible screen.
   *
   * The Worker cannot know which language a reader uses — the session says nothing about it,
   * and the same payload is cached and reused. Only the client knows.
   */
  labelKey: "todayVisits" | "todayRevenue" | "monthRevenue" | "outstanding";
  value: string;
  /** Numbers and already-formatted money for the hint; the client assembles the sentence. */
  hintValues: Array<string | number>;
  tone: "sun" | "mint" | "sky" | "ink";
}

/** One line of a booking: what was sold, at the price and length agreed then. */
export interface BookingServiceLine {
  serviceId: number | null;
  name: string;
  price: number;
  duration: number;
}

export interface ReservationItem {
  id: number;
  clientName: string;
  /**
   * The FIRST service, plus "+N" when there are more.
   *
   * Kept because both Telegram bots read `bookings.service_name` by name and deploy from their
   * own repos, so the column cannot go away. Prefer `services` for anything that has room to
   * show the lines — this string is a summary, not the content.
   */
  serviceName: string;
  /**
   * Every service on the booking, in the order it was chosen.
   *
   * Always at least one line: the migration backfilled historical bookings, so nothing has to
   * special-case "old booking with no lines".
   */
  services: BookingServiceLine[];
  staffName: string;
  date: string;
  time: string;
  datetime: string;
  status: BookingStatus;
  price: number;
  duration: number;
  userId: number | null;
  payment: PaymentSummary;
}

export interface CalendarSlotMarker {
  id: number;
  time: string;
}

export interface CalendarStaffColumn {
  id: number;
  name: string;
  role: string;
  serviceNames: string[];
  slots: CalendarSlotMarker[];
  utilization: number;
  completedRevenue: number;
}

export interface CalendarBookingCard extends ReservationItem {
  staffId: number | null;
  serviceId: number | null;
  color: string;
}

/**
 * One payment TAKEN on the selected day, whichever booking it belongs to.
 *
 * The cash desk used to build this list client-side out of the bookings scheduled that day, so
 * money taken today against a booking scheduled for next week vanished from the breakdown while
 * still counting towards the headline figure — three numbers on one screen disagreeing with the
 * fourth. Basis matters: a cash desk reconciles what went through the till today.
 */
export interface DayPayment {
  id: number;
  amount: number;
  method: PaymentMethod;
  flow: PaymentFlow;
  createdAt: string;
  clientName: string;
  serviceName: string;
  staffName: string;
}

export interface PaymentEntry {
  id: number;
  amount: number;
  method: PaymentMethod;
  flow: PaymentFlow;
  note: string | null;
  createdAt: string;
}

export interface PaymentSummary {
  incoming: number;
  outgoing: number;
  net: number;
  remaining: number;
  status: PaymentStatus;
  history: PaymentEntry[];
}

export interface EmployeeRow {
  id: number;
  name: string;
  /**
   * The role the owner typed, or "" when unset. Deliberately not defaulted server-side:
   * it used to fall back to a hardcoded Russian "Специалист", which the UI rendered
   * verbatim to Uzbek and English owners. The UI localizes the empty case.
   */
  role: string;
  /** Canonical E.164, e.g. +998901234567. Null when unknown. */
  phone: string | null;
  /** Whether GET /api/staff/<id>/photo will return an image. */
  hasPhoto: boolean;
  /** When it was last written, for cache-busting the image URL. Null for a Telegram-only photo. */
  photoVersion: string | null;
  linkedServices: string[];
  totalLinkedServices: number;
  weeklySlotCount: number;
  todayBookings: number;
  upcomingBookings: number;
  completedRevenue: number;
  todayRevenue: number;
  outstandingRevenue: number;
  utilization: number;
  weeklySlots: Array<{
    weekday: number;
    label: string;
    slots: string[];
  }>;
  weeklyBreaks: Array<{
    weekday: number;
    label: string;
    slots: string[];
  }>;
  dayOffs: Array<{
    date: string;
    isFullDay: boolean;
    slots: string[];
  }>;
}

export interface ServiceCatalogItem {
  id: number;
  name: string;
  /** Owner-chosen grouping, or "" when uncategorised. Free text — see the migration. */
  category: string;
  price: number;
  duration: number;
  isActive: boolean;
  /** A flag, not an id: the bytes come from /api/services/<id>/photo. Same shape as staff. */
  hasPhoto: boolean;
  /** When the picture was last written. Put in the image URL so a replacement is a new URL. */
  photoVersion: string | null;
  linkedStaffIds: number[];
  linkedStaffNames: string[];
  bookingsCount: number;
  /**
   * Per-staff counts behind `bookingsCount`, keyed by staff id.
   *
   * Transport only — redactPayloadFor uses it to scope `bookingsCount` for a master and then
   * removes it from every response, so the client never sees this field.
   */
  bookingsCountByStaff?: Record<string, number>;
  upcomingBookings: number;
  completedRevenue: number;
}

export interface ClientHistoryItem extends ReservationItem {
  businessName: string;
  /**
   * Which master performed it.
   *
   * `staffName` is already on the row but cannot be used to attribute a client to a master:
   * it is a snapshot taken when the booking was made, so it keeps the old spelling after a
   * rename, and two people called Aziz are indistinguishable. Null for a booking whose staff
   * row was deleted.
   */
  staffId: number | null;
}

export interface ClientRow {
  key: string;
  name: string;
  userId: number | null;
  /** Canonical E.164, or null for bot bookings which carry no phone. */
  phone: string | null;
  totalVisits: number;
  completedVisits: number;
  upcomingVisits: number;
  cancelledVisits: number;
  spentTotal: number;
  lastVisit: string | null;
  favoriteStaff: string;
  history: ClientHistoryItem[];
}

export interface EmployeeRevenueItem {
  staffId: number;
  staffName: string;
  revenue: number;
  completedVisits: number;
}

export interface BookingLinkItem {
  id: string;
  /** i18n key resolved in the UI. The worker must not return display copy — it has no
   *  idea which of uz/ru/en the viewer reads. */
  titleKey: "publicBooking" | "ownerBot" | "clientBot";
  url: string;
  kind: "public" | "admin";
}

/* ── Public booking page (unauthenticated, tenant-scoped) ─────────────────── */

export interface PublicService {
  id: number;
  name: string;
  /** Grouping heading on the booking page. "" means uncategorised. */
  category: string;
  price: number;
  duration: number;
  staffIds: number[];
}

export interface PublicStaff {
  id: number;
  name: string;
  /** The owner-set role, falling back to the first linked service, or "" if neither. */
  role: string;
  /** Whether GET /api/public/staff/<id>/photo will return an image. */
  hasPhoto: boolean;
}

export interface PublicBusinessPayload {
  name: string;
  type: string;
  address: string;
  phone: string;
  schedule: string;
  description: string | null;
  hasPhoto: boolean;
  /** Resolved accent for this business; never null, falls back to the easyQ green. */
  brandColor: string;
  /** Resolved page theme; never null, so the page never has to decide what "unset" means. */
  brandTheme: BrandThemeValue;
  /** Which steps this page shows and in what order. */
  bookingFlow: BookingFlow;
  services: PublicService[];
  staff: PublicStaff[];
  /** IANA zone the business runs on, so the client page agrees about "today". */
  timeZone: string;
  today: string;
}

export interface PublicSlotsPayload {
  date: string;
  staffId: number;
  /** Free `HH:MM` values, already excluding breaks, days off and taken slots. */
  slots: string[];
}

/** Manual booking taken by staff — over the phone, or a walk-in being recorded. */
export interface CreateCrmBookingInput {
  serviceId?: number;
  serviceIds?: number[];
  staffId: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone?: string;
  notes?: string;
}

export interface CreatePublicBookingInput {
  /**
   * Kept for callers that book one service — the CRM modal, and any client on an older
   * bundle. `serviceIds` wins when both are sent.
   */
  serviceId?: number;
  /** Several services in one visit, in the order the customer ticked them. */
  serviceIds?: number[];
  staffId: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
  notes?: string;
}

export interface CrmPayload {
  business: BusinessProfile;
  generatedAt: string;
  selectedDate: string;
  miniCalendarAnchor: string;
  kpis: KpiCard[];
  reservationsToday: ReservationItem[];
  calendar: {
    date: string;
    columns: CalendarStaffColumn[];
    bookings: CalendarBookingCard[];
    dayRevenue: number;
    totalAppointments: number;
    completedAppointments: number;
  };
  employees: EmployeeRow[];
  services: ServiceCatalogItem[];
  clients: ClientRow[];
  analytics: {
    employeeRevenue: EmployeeRevenueItem[];
    monthlyRevenue: number;
    totalRevenue: number;
    collectedToday: number;
    refundsToday: number;
    totalOutstanding: number;
    totalCompletedVisits: number;
    totalCancelledVisits: number;
  };
  bookingLinks: BookingLinkItem[];
  /** Payments recorded on `selectedDate`, for the cash desk. */
  paymentsToday: DayPayment[];
  /**
   * Emptied by redactPayloadFor for any actor without the `access:manage` capability,
   * which today means everyone but the owner. Carries login usernames, so it must stay
   * gated on the capability rather than on a role name.
   */
  staffAccess: StaffAccessRow[];
  /**
   * The shop's subscription, as of today in the shop's own timezone.
   *
   * Sent to every role, unredacted: a specialist who cannot open the calendar needs to be told
   * why, and "the shop has not paid" is not a secret from the people who work there. Only the
   * owner is offered the plan picker.
   */
  subscription: SubscriptionInfo;
}

export interface UpdateBookingStatusInput {
  status: BookingStatus;
}

export interface CreatePaymentInput {
  amount: number;
  method: PaymentMethod;
  flow?: PaymentFlow;
  note?: string;
}

export interface AddEmployeeInput {
  name: string;
  role?: string;
  phone?: string;
}

export interface UpdateEmployeeInput {
  name: string;
  role?: string;
  phone?: string;
}

export interface UpsertServiceInput {
  name: string;
  category?: string;
  price: number;
  duration: number;
  staffIds: number[];
}

export interface UpdateServiceInput {
  name?: string;
  category?: string;
  price?: number;
  duration?: number;
  staffIds?: number[];
  isActive?: boolean;
}

export interface UpdateEmployeeSlotsInput {
  weeklySlots: Array<{
    weekday: number;
    slots: string[];
  }>;
  weeklyBreaks: Array<{
    weekday: number;
    slots: string[];
  }>;
  dayOffs: Array<{
    date: string;
    isFullDay: boolean;
    slots: string[];
  }>;
}

export interface UpdateBusinessProfileInput {
  name?: string;
  type?: string;
  address?: string;
  phone?: string;
  schedule?: string;
  description?: string | null;
  brandColor?: string | null;
  /** Null clears the theme back to easyQ's. Omitted leaves it untouched. */
  brandTheme?: BrandThemeValue | null;
  bookingFlow?: BookingFlow;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface UpdateCrmCredentialsInput {
  username: string;
  currentPassword: string;
  newPassword?: string;
}

/**
 * Change your own password. Deliberately carries no staffId — the target row is taken
 * from the session, or this would be an account-takeover endpoint.
 */
export interface ChangeOwnPasswordInput {
  currentPassword: string;
  newPassword: string;
}
