export type BookingStatus = "pending" | "confirmed" | "done" | "cancelled";
export type AppSection = "overview" | "calendar" | "employees" | "services" | "clients" | "analytics" | "booking";
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
  role: string;
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
  title: string;
  subtitle: string;
  url: string;
  kind: "public" | "admin" | "preview";
  description: string;
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
}
