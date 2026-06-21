import { CRM_T, type Lang } from './i18n';
import { addDays } from '../lib/date';
import type {
  BookingStatus,
  CalendarBookingCard,
  ClientHistoryItem,
  ClientRow,
  CrmPayload,
  EmployeeRow,
  PaymentEntry,
  PaymentMethod,
  PaymentSummary,
  ReservationItem,
  ServiceCatalogItem,
} from '../types';

export type StaffItem = { id: number; name: string; roleKey: string; color: string; av: string; bookings: number; revenue: string; rating: number; load: number };
export type ServiceItem = { id: number; key: string; catKey: string; dur: number; price: string; bookings: number; color: string };
export type CustomerItem = { id: number; name: string; phone: string; visits: number; spent: string; last: string; tier: string; via: string; av: string; staff: number };
export type InventoryItem = { id: number; key: string; catKey: string; stock: number; min: number; price: string; color: string };

export const STAFF: StaffItem[] = [
  { id: 1, name: 'Sardor Karimov', roleKey: 'barber', color: '#84A92E', av: '#CBA988', bookings: 142, revenue: '12.4M', rating: 4.9, load: 92 },
  { id: 2, name: 'Bekzod Tursunov', roleKey: 'barber', color: '#3B82F6', av: '#7BB7E8', bookings: 118, revenue: '9.8M', rating: 4.8, load: 81 },
  { id: 3, name: 'Aziz Komilov', roleKey: 'barber', color: '#8B5CF6', av: '#C9A6E8', bookings: 96, revenue: '7.6M', rating: 4.7, load: 74 },
  { id: 4, name: 'Jahongir N.', roleKey: 'stylist', color: '#F59E0B', av: '#E8B57B', bookings: 64, revenue: '5.1M', rating: 4.9, load: 58 },
];

export const ROLE: Record<Lang, Record<string, string>> = {
  uz: { barber: 'Sartarosh', stylist: 'Stilist' },
  ru: { barber: 'Барбер', stylist: 'Стилист' },
  en: { barber: 'Barber', stylist: 'Stylist' },
};

export const SERVICES: ServiceItem[] = [
  { id: 1, key: 'haircut', catKey: 'hair', dur: 45, price: '80 000', bookings: 312, color: '#84A92E' },
  { id: 2, key: 'beard', catKey: 'beard', dur: 20, price: '40 000', bookings: 208, color: '#3B82F6' },
  { id: 3, key: 'combo', catKey: 'hair', dur: 60, price: '110 000', bookings: 261, color: '#8B5CF6' },
  { id: 4, key: 'kids', catKey: 'hair', dur: 30, price: '55 000', bookings: 96, color: '#F59E0B' },
  { id: 5, key: 'shave', catKey: 'beard', dur: 30, price: '60 000', bookings: 74, color: '#14B8A6' },
  { id: 6, key: 'style', catKey: 'hair', dur: 40, price: '70 000', bookings: 53, color: '#F43F5E' },
];

export const SERV_NAME: Record<Lang, Record<string, string>> = {
  uz: { haircut: 'Soch olish', beard: 'Soqol olish', combo: 'Soch + soqol', kids: 'Bolalar', shave: 'Ustara bilan olish', style: 'Soch turmagi' },
  ru: { haircut: 'Стрижка', beard: 'Борода', combo: 'Стрижка + борода', kids: 'Детская', shave: 'Бритьё', style: 'Укладка' },
  en: { haircut: 'Haircut', beard: 'Beard trim', combo: 'Haircut + beard', kids: 'Kids cut', shave: 'Razor shave', style: 'Styling' },
};

export const CAT_NAME: Record<Lang, Record<string, string>> = {
  uz: { hair: 'Soch', beard: 'Soqol' },
  ru: { hair: 'Волосы', beard: 'Борода' },
  en: { hair: 'Hair', beard: 'Beard' },
};

export const CUSTOMERS: CustomerItem[] = [
  { id: 1, name: 'Jasur Aliyev', phone: '+998 90 123 45 67', visits: 24, spent: '2.6M', last: '2d', tier: 'vip', via: 'telegram', av: '#CBA988', staff: 1 },
  { id: 2, name: 'Dilnoza Rashidova', phone: '+998 91 234 56 78', visits: 12, spent: '1.4M', last: '5d', tier: 'reg', via: 'telegram', av: '#D2A99e', staff: 4 },
  { id: 3, name: 'Otabek Mirzayev', phone: '+998 93 345 67 89', visits: 31, spent: '3.2M', last: '1d', tier: 'vip', via: 'web', av: '#7BB7E8', staff: 1 },
  { id: 4, name: 'Nodira Saidova', phone: '+998 94 456 78 90', visits: 3, spent: '240K', last: '12d', tier: 'new', via: 'telegram', av: '#C9A6E8', staff: 2 },
  { id: 5, name: 'Aziz Karimov', phone: '+998 97 567 89 01', visits: 18, spent: '1.9M', last: '3d', tier: 'reg', via: 'walkin', av: '#E8B57B', staff: 3 },
  { id: 6, name: 'Madina Yusupova', phone: '+998 99 678 90 12', visits: 8, spent: '920K', last: '7d', tier: 'reg', via: 'telegram', av: '#9CC6A0', staff: 4 },
  { id: 7, name: 'Bobur Toshev', phone: '+998 90 789 01 23', visits: 2, spent: '160K', last: '20d', tier: 'new', via: 'phone', av: '#A8B0BE', staff: 2 },
  { id: 8, name: 'Kamola Ismoilova', phone: '+998 91 890 12 34', visits: 15, spent: '1.7M', last: '4d', tier: 'vip', via: 'telegram', av: '#E0A8C0', staff: 1 },
];

export const INVENTORY: InventoryItem[] = [
  { id: 1, key: 'pomade', catKey: 'hair', stock: 3, min: 8, price: '65 000', color: '#84A92E' },
  { id: 2, key: 'shampoo', catKey: 'hair', stock: 24, min: 10, price: '45 000', color: '#3B82F6' },
  { id: 3, key: 'beardoil', catKey: 'beard', stock: 6, min: 6, price: '85 000', color: '#F59E0B' },
  { id: 4, key: 'razor', catKey: 'tools', stock: 18, min: 5, price: '120 000', color: '#8B5CF6' },
  { id: 5, key: 'wax', catKey: 'hair', stock: 2, min: 8, price: '55 000', color: '#14B8A6' },
  { id: 6, key: 'aftershave', catKey: 'beard', stock: 14, min: 6, price: '70 000', color: '#F43F5E' },
  { id: 7, key: 'blades', catKey: 'tools', stock: 0, min: 12, price: '30 000', color: '#64748B' },
  { id: 8, key: 'comb', catKey: 'retail', stock: 32, min: 8, price: '25 000', color: '#84A92E' },
];

export const INV_NAME: Record<Lang, Record<string, string>> = {
  uz: { pomade: 'Pomada (gel)', shampoo: 'Shampun', beardoil: 'Soqol moyi', razor: 'Ustara', wax: 'Vosk', aftershave: 'Aftersheyv', blades: 'Tig‘lar (10x)', comb: 'Taroq' },
  ru: { pomade: 'Помада (гель)', shampoo: 'Шампунь', beardoil: 'Масло для бороды', razor: 'Бритва', wax: 'Воск', aftershave: 'Афтершейв', blades: 'Лезвия (10x)', comb: 'Расчёска' },
  en: { pomade: 'Pomade (gel)', shampoo: 'Shampoo', beardoil: 'Beard oil', razor: 'Razor', wax: 'Wax', aftershave: 'Aftershave', blades: 'Blades (10x)', comb: 'Comb' },
};

export const SERVICE_COLORS = ['#84A92E', '#3B82F6', '#8B5CF6', '#F59E0B', '#14B8A6', '#F43F5E'];
export const AVATAR_COLORS = ['#CBA988', '#7BB7E8', '#C9A6E8', '#E8B57B', '#9CC6A0', '#A8B0BE', '#E0A8C0', '#D2A99e'];

/* ============================================================================
 * Demo payload for the public landing embed (?embed=1).
 * Builds a full, well-formed CrmPayload from the static mock arrays above so the
 * real (data-backed) screens render with no auth and no API calls.
 * ==========================================================================*/

const BIZ_TYPE: Record<Lang, string> = {
  uz: 'Sartaroshxona · Toshkent',
  ru: 'Барбершоп · Ташкент',
  en: 'Barbershop · Tashkent',
};
const BIZ_ADDRESS: Record<Lang, string> = {
  uz: 'Toshkent, Amir Temur ko‘chasi 12',
  ru: 'ул. Амира Темура 12, Ташкент',
  en: '12 Amir Temur St, Tashkent',
};

/** Parse the mock money strings ('80 000', '12.4M', '240K') into integers. */
function money(s: string): number {
  const v = s.trim();
  if (/m$/i.test(v)) return Math.round(parseFloat(v) * 1_000_000);
  if (/k$/i.test(v)) return Math.round(parseFloat(v) * 1_000);
  return parseInt(v.replace(/[^\d]/g, ''), 10) || 0;
}

// staffIdx, custIdx, serviceIdx, time, status, payment method (for "done")
const DEMO_BOOKINGS: Array<{ st: number; cu: number; sv: number; time: string; status: BookingStatus; method?: PaymentMethod }> = [
  { st: 0, cu: 0, sv: 0, time: '09:00', status: 'done', method: 'cash' },
  { st: 1, cu: 2, sv: 2, time: '09:30', status: 'done', method: 'card' },
  { st: 2, cu: 5, sv: 4, time: '10:30', status: 'done', method: 'cash' },
  { st: 0, cu: 4, sv: 1, time: '11:00', status: 'confirmed' },
  { st: 3, cu: 1, sv: 5, time: '11:30', status: 'confirmed' },
  { st: 1, cu: 7, sv: 0, time: '12:00', status: 'pending' },
  { st: 2, cu: 6, sv: 2, time: '13:30', status: 'done', method: 'transfer' },
  { st: 0, cu: 3, sv: 0, time: '14:00', status: 'confirmed' },
  { st: 3, cu: 2, sv: 1, time: '15:00', status: 'confirmed' },
  { st: 1, cu: 0, sv: 3, time: '16:00', status: 'pending' },
  { st: 2, cu: 7, sv: 0, time: '17:00', status: 'confirmed' },
  { st: 0, cu: 5, sv: 2, time: '18:00', status: 'done', method: 'card' },
];

export function buildMockPayload(date: string, lang: Lang): CrmPayload {
  const servName = (i: number) => SERV_NAME[lang][SERVICES[i].key];

  const bookings: CalendarBookingCard[] = DEMO_BOOKINGS.map((b, idx) => {
    const svc = SERVICES[b.sv];
    const price = money(svc.price);
    const paid = b.status === 'done';
    const history: PaymentEntry[] = paid
      ? [{ id: idx + 1, amount: price, method: b.method || 'cash', flow: 'in', note: null, createdAt: `${date}T${b.time}:00` }]
      : [];
    const payment: PaymentSummary = {
      incoming: paid ? price : 0,
      outgoing: 0,
      net: paid ? price : 0,
      remaining: paid ? 0 : price,
      status: paid ? 'paid' : 'unpaid',
      history,
    };
    return {
      id: idx + 1,
      clientName: CUSTOMERS[b.cu].name,
      serviceName: servName(b.sv),
      staffName: STAFF[b.st].name,
      date,
      time: b.time,
      datetime: `${date}T${b.time}:00`,
      status: b.status,
      price,
      duration: svc.dur,
      userId: null,
      payment,
      staffId: STAFF[b.st].id,
      serviceId: svc.id,
      color: SERVICE_COLORS[b.sv % SERVICE_COLORS.length],
    };
  });

  const reservationsToday: ReservationItem[] = bookings
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(({ id, clientName, serviceName, staffName, date: d, time, datetime, status, price, duration, userId, payment }) => ({
      id, clientName, serviceName, staffName, date: d, time, datetime, status, price, duration, userId, payment,
    }));

  const employees: EmployeeRow[] = STAFF.map((s, i) => {
    const mine = bookings.filter((b) => b.staffId === s.id);
    return {
      id: s.id,
      name: s.name,
      role: ROLE[lang][s.roleKey],
      linkedServices: SERVICES.slice(0, 3).map((sv) => SERV_NAME[lang][sv.key]),
      totalLinkedServices: 3 + (i % 3),
      weeklySlotCount: 24 + i * 4,
      todayBookings: mine.filter((b) => b.status !== 'cancelled').length,
      upcomingBookings: mine.filter((b) => b.status === 'pending' || b.status === 'confirmed').length,
      completedRevenue: money(s.revenue),
      todayRevenue: mine.reduce((a, b) => a + b.payment.incoming, 0),
      outstandingRevenue: mine.reduce((a, b) => a + b.payment.remaining, 0),
      utilization: s.load,
      weeklySlots: [],
      weeklyBreaks: [],
      dayOffs: [],
    };
  });

  const services: ServiceCatalogItem[] = SERVICES.map((sv, i) => {
    const linked = STAFF.slice(0, 2 + (i % 3));
    return {
      id: sv.id,
      name: SERV_NAME[lang][sv.key],
      price: money(sv.price),
      duration: sv.dur,
      isActive: true,
      linkedStaffIds: linked.map((s) => s.id),
      linkedStaffNames: linked.map((s) => s.name),
      bookingsCount: sv.bookings,
      upcomingBookings: Math.round(sv.bookings / 10),
      completedRevenue: money(sv.price) * sv.bookings,
    };
  });

  const clients: ClientRow[] = CUSTOMERS.map((c) => {
    const fav = STAFF[(c.staff - 1 + STAFF.length) % STAFF.length] || STAFF[0];
    const history: ClientHistoryItem[] = [0, 2, 1].map((si, k) => {
      const sv = SERVICES[si];
      const price = money(sv.price);
      return {
        id: c.id * 10 + k,
        clientName: c.name,
        serviceName: SERV_NAME[lang][sv.key],
        staffName: fav.name,
        date: addDays(date, -(k + 1) * 7),
        time: '12:00',
        datetime: `${addDays(date, -(k + 1) * 7)}T12:00:00`,
        status: 'done',
        price,
        duration: sv.dur,
        userId: null,
        payment: { incoming: price, outgoing: 0, net: price, remaining: 0, status: 'paid', history: [] },
        businessName: 'Barber House',
      };
    });
    return {
      key: String(c.id),
      name: c.name,
      userId: null,
      totalVisits: c.visits,
      completedVisits: c.visits,
      upcomingVisits: 0,
      cancelledVisits: 0,
      spentTotal: money(c.spent),
      lastVisit: date,
      favoriteStaff: fav.name,
      history,
    };
  });

  const employeeRevenue = STAFF.map((s) => ({ staffId: s.id, staffName: s.name, revenue: money(s.revenue), completedVisits: s.bookings })).sort((a, b) => b.revenue - a.revenue);
  const collectedToday = bookings.reduce((a, b) => a + b.payment.incoming, 0);
  const totalOutstanding = bookings.reduce((a, b) => a + b.payment.remaining, 0);
  const totalRevenue = employeeRevenue.reduce((a, e) => a + e.revenue, 0);

  const dash = CRM_T[lang].dash;
  const tones = ['mint', 'sky', 'sun', 'ink'] as const;
  const kpis = dash.kpis.map((k: { l: string; v: string; u: string; d: string }, i: number) => ({
    id: 'k' + i,
    label: k.l,
    value: `${k.v}${k.u ? ' ' + k.u : ''}`,
    hint: k.d,
    tone: tones[i % tones.length],
  }));

  return {
    business: {
      id: 1,
      name: 'Barber House',
      type: BIZ_TYPE[lang],
      address: BIZ_ADDRESS[lang],
      phone: '+998 90 123 45 67',
      schedule: 'Du–Sh: 09:00 – 20:00',
      description: null,
      photoFileId: null,
      photoFileUniqueId: null,
      crmUsername: 'barber_house',
      crmHasTemporaryPassword: false,
    },
    generatedAt: `${date}T08:00:00`,
    selectedDate: date,
    miniCalendarAnchor: date,
    kpis,
    reservationsToday,
    calendar: {
      date,
      columns: STAFF.map((s) => ({ id: s.id, name: s.name, role: ROLE[lang][s.roleKey], serviceNames: [], slots: [], utilization: s.load, completedRevenue: money(s.revenue) })),
      bookings,
      dayRevenue: collectedToday,
      totalAppointments: bookings.length,
      completedAppointments: bookings.filter((b) => b.status === 'done').length,
    },
    employees,
    services,
    clients,
    analytics: {
      employeeRevenue,
      monthlyRevenue: Math.round(totalRevenue * 0.4),
      totalRevenue,
      collectedToday,
      refundsToday: 0,
      totalOutstanding,
      totalCompletedVisits: bookings.filter((b) => b.status === 'done').length,
      totalCancelledVisits: 0,
    },
    bookingLinks: [
      { id: 'public', title: 'Barber House', subtitle: 'easyq.uz/barber-house', url: 'https://easyq.uz/barber-house', kind: 'public', description: '' },
    ],
  };
}
