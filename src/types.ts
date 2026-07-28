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
  label: string;
  value: string;
  hint: string;
  tone: "sun" | "mint" | "sky" | "ink";
}

export interface ReservationItem {
  id: number;
  clientName: string;
  serviceName: string;
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
  /** Canonical +998XXXXXXXXX, or null. */
  phone: string | null;
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
  price: number;
  duration: number;
  isActive: boolean;
  linkedStaffIds: number[];
  linkedStaffNames: string[];
  bookingsCount: number;
  upcomingBookings: number;
  completedRevenue: number;
}

export interface ClientHistoryItem extends ReservationItem {
  businessName: string;
}

export interface ClientRow {
  key: string;
  name: string;
  userId: number | null;
  /** Canonical +998XXXXXXXXX, or null for bot bookings which carry no phone. */
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
  price: number;
  duration: number;
  staffIds: number[];
}

export interface PublicStaff {
  id: number;
  name: string;
  /** The owner-set role, falling back to the first linked service, or "" if neither. */
  role: string;
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
  serviceId: number;
  staffId: number;
  date: string;
  time: string;
  clientName: string;
  clientPhone?: string;
  notes?: string;
}

export interface CreatePublicBookingInput {
  serviceId: number;
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
  /**
   * Emptied by redactPayloadFor for any actor without the `access:manage` capability,
   * which today means everyone but the owner. Carries login usernames, so it must stay
   * gated on the capability rather than on a role name.
   */
  staffAccess: StaffAccessRow[];
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
  price: number;
  duration: number;
  staffIds: number[];
}

export interface UpdateServiceInput {
  name?: string;
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
