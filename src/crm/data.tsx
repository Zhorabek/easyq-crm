import { createContext, useContext } from 'react';
import type {
  CalendarBookingCard,
  ClientRow,
  CrmPayload,
  EmployeeRow,
  ServiceCatalogItem,
} from '../types';

export type DataValue = {
  payload: CrmPayload | null;
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  reload: () => void;
  loading: boolean;
  /** cache of extra days fetched for the Week/Month schedule views */
  dayCache: Record<string, CrmPayload>;
  ensureDays: (dates: string[]) => void;
  /* actions wired by App */
  openBooking: (b: CalendarBookingCard) => void;
  openClient: (c: ClientRow) => void;
  openStaffEditor: (e: EmployeeRow | null) => void;
  openSlots: (e: EmployeeRow) => void;
  createStaff: (name: string) => void;
  openServiceEditor: (s: ServiceCatalogItem | null) => void;
  toggleServiceActive: (s: ServiceCatalogItem) => void;
  openBusinessEditor: () => void;
  openCredentialsEditor: () => void;
  uploadBusinessPhoto: () => void;
  deleteBusinessPhoto: () => void;
};

export const DataCtx = createContext<DataValue | null>(null);

export function useData(): DataValue {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useData must be used within DataCtx provider');
  return v;
}

/* ---------------- derived helpers (pure) ---------------- */

const PALETTE = ['#84A92E', '#3B82F6', '#8B5CF6', '#F59E0B', '#14B8A6', '#F43F5E'];

export function colorForId(id: number | null | undefined): string {
  if (id == null) return '#84A92E';
  return PALETTE[Math.abs(id) % PALETTE.length];
}

export function avatarColor(seed: string): string {
  const colors = ['#CBA988', '#7BB7E8', '#C9A6E8', '#E8B57B', '#9CC6A0', '#A8B0BE', '#E0A8C0', '#D2A99e'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

export function fmtSom(n: number): string {
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ').replace(/ /g, ' ');
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

/** flatten every payment entry attached to the selected day's bookings */
export function dayPayments(payload: CrmPayload | null) {
  if (!payload) return [] as Array<{ id: number; amount: number; method: string; flow: string; createdAt: string; clientName: string; serviceName: string; staffName: string }>;
  const rows: Array<{ id: number; amount: number; method: string; flow: string; createdAt: string; clientName: string; serviceName: string; staffName: string }> = [];
  for (const b of payload.calendar.bookings) {
    for (const p of b.payment.history) {
      rows.push({ id: p.id, amount: p.amount, method: p.method, flow: p.flow, createdAt: p.createdAt, clientName: b.clientName, serviceName: b.serviceName, staffName: b.staffName });
    }
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
