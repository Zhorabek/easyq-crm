import { useEffect, useMemo, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';
import { Avatar, Badge, Donut, Panel, SetField, SetHead, SetRow, setInput, StatusBadge, Switch } from './ui';
import { avatarColor, colorForId, dayPayments, fmtSom, useData } from './data';
import { addDays, isoToday, parseBusinessHours } from '../lib/date';
import type { CalendarBookingCard, ClientRow, CrmPayload, EmployeeRow, ServiceCatalogItem } from '../types';

const PALETTE = ['#84A92E', '#3B82F6', '#8B5CF6', '#F59E0B', '#14B8A6', '#F43F5E'];
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const kpiIcons = ['wallet', 'calendar', 'trend', 'finance'];
const kpiTints = ['var(--accent-tint)', 'var(--blue-t)', 'var(--violet-t)', 'var(--amber-t)'];
const kpiColors = ['var(--accent-deep)', 'var(--blue)', 'var(--violet)', 'var(--amber)'];

function EmptyHint({ text }: { text: string }) {
  return <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13.5, fontWeight: 600 }}>{text}</div>;
}

/* ============ DASHBOARD ============ */
export function Dashboard() {
  const { t, lang } = useCRM();
  const { payload, openBooking } = useData();
  if (!payload) return null;
  const d = t.dash;
  const topServices = [...payload.services].sort((a, b) => b.bookingsCount - a.bookingsCount).slice(0, 5);
  const servSegments = topServices.map((s, i) => ({ v: Math.max(s.bookingsCount, 1), color: PALETTE[i % PALETTE.length], name: s.name }));
  const totalServ = topServices.reduce((s, x) => s + x.bookingsCount, 0);
  const empMax = payload.analytics.employeeRevenue[0]?.revenue || 1;

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="crm-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {payload.kpis.map((k, i) => (
          <Panel key={k.id} pad={18}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: kpiTints[i % 4], color: kpiColors[i % 4], display: 'grid', placeItems: 'center' }}>
              <Ic name={kpiIcons[i % 4]} size={21} stroke={2} />
            </span>
            <div className="tnum" style={{ marginTop: 14, fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', whiteSpace: 'nowrap' }}>{k.value}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{k.label}</div>
            {k.hint && <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginTop: 4 }}>{k.hint}</div>}
          </Panel>
        ))}
      </div>

      <div className="crm-dash-2col" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        {/* upcoming / today's bookings */}
        <Panel pad={0}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{d.upcoming}</div>
            <Badge color="var(--ink-2)" tint="var(--panel-2)">{payload.reservationsToday.length}</Badge>
          </div>
          {payload.reservationsToday.length === 0 ? (
            <EmptyHint text={t.cal.staffAll} />
          ) : (
            payload.reservationsToday.slice(0, 7).map((b) => {
              const full = payload.calendar.bookings.find((x) => x.id === b.id) || null;
              return (
                <button key={b.id} onClick={() => full && openBooking(full)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderTop: '1px solid var(--line)', textAlign: 'left', background: 'transparent' }}>
                  <div className="tnum" style={{ fontSize: 14, fontWeight: 800, width: 46, color: 'var(--ink)' }}>{b.time}</div>
                  <span style={{ width: 3, height: 32, borderRadius: 3, background: colorForId(b.id), flex: 'none' }} />
                  <Avatar name={b.clientName} color={avatarColor(b.clientName)} size={36} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.clientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{b.serviceName} · {b.staffName.split(' ')[0]}</div>
                  </div>
                  <StatusBadge status={b.status} />
                </button>
              );
            })
          )}
        </Panel>

        {/* staff today (load) */}
        <Panel>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>{d.staffToday}</div>
          {payload.employees.length === 0 ? (
            <EmptyHint text={t.staff.title} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {payload.employees.slice(0, 6).map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={s.name} color={avatarColor(s.name)} size={36} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    <div style={{ height: 5, background: 'var(--panel-2)', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: Math.min(100, s.utilization) + '%', height: '100%', background: colorForId(s.id) }} />
                    </div>
                  </div>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 800, width: 40, textAlign: 'right' }}>{Math.round(s.utilization)}%</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="crm-dash-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>
        {/* bookings by service donut */}
        <Panel>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{d.bookingsBy}</div>
          {totalServ === 0 ? (
            <EmptyHint text={t.serv.title} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ position: 'relative', flex: 'none' }}>
                <Donut segments={servSegments} size={132} thickness={17} />
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                  <div>
                    <div className="tnum" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{totalServ}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 700 }}>{t.nav.calendar}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0 }}>
                {servSegments.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 800 }}>{s.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        {/* employee revenue leaderboard */}
        <Panel>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>{t.an.topStaff}</div>
          {payload.analytics.employeeRevenue.length === 0 ? (
            <EmptyHint text={t.staff.title} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {payload.analytics.employeeRevenue.slice(0, 6).map((item) => (
                <div key={item.staffId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={item.staffName} color={avatarColor(item.staffName)} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.staffName}</div>
                    <div style={{ height: 5, background: 'var(--panel-2)', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ width: Math.max(8, (item.revenue / empMax) * 100) + '%', height: '100%', background: colorForId(item.staffId) }} />
                    </div>
                  </div>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtSom(item.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ============ SCHEDULE / CALENDAR ============ */
function useNarrow(bp = 680) {
  const [n, setN] = useState(typeof window !== 'undefined' && window.innerWidth <= bp);
  useEffect(() => {
    const on = () => setN(window.innerWidth <= bp);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [bp]);
  return n;
}

export function Calendar() {
  const { t, lang } = useCRM();
  const { payload, selectedDate, setSelectedDate, dayCache, ensureDays } = useData();
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  if (!payload) return null;
  const c = t.cal;

  const dt = new Date(selectedDate + 'T00:00:00');
  const monthName = c.monthNames[dt.getMonth()];
  const weekdayIdx = (dt.getDay() + 6) % 7; // 0=Mon
  const weekStart = addDays(selectedDate, -weekdayIdx);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const header = view === 'day' ? `${c.weekdaysFull[weekdayIdx]}, ${dt.getDate()} ${monthName}` : view === 'week' ? `${monthName} ${dt.getFullYear()}` : `${monthName} ${dt.getFullYear()}`;

  useEffect(() => {
    if (view === 'week') ensureDays(weekDays);
    if (view === 'month') {
      const first = new Date(dt.getFullYear(), dt.getMonth(), 1);
      const days = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      const list = Array.from({ length: days }, (_, i) => {
        const dd = new Date(first.getFullYear(), first.getMonth(), i + 1);
        return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      });
      ensureDays(list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedDate]);

  const move = (delta: number) => {
    if (view === 'day') setSelectedDate(addDays(selectedDate, delta));
    else if (view === 'week') setSelectedDate(addDays(selectedDate, delta * 7));
    else {
      const nd = new Date(dt.getFullYear(), dt.getMonth() + delta, Math.min(dt.getDate(), 28));
      setSelectedDate(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`);
    }
  };
  const navArrow = { width: 36, height: 36, borderRadius: 10, background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center' } as const;

  return (
    <div className="fadein" style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => move(-1)} style={navArrow}><Ic name="chevL" size={18} /></button>
          <button onClick={() => move(1)} style={navArrow}><Ic name="chevR" size={18} /></button>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap' }}>{header}</div>
        <button onClick={() => setSelectedDate(isoToday())} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-deep)', background: 'var(--accent-tint)', padding: '6px 12px', borderRadius: 9 }}>{t.today}</button>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 3, gap: 2 }}>
          {([['day', t.day], ['week', t.week], ['month', t.month]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 8, color: view === k ? 'var(--accent-ink)' : 'var(--ink-3)', background: view === k ? 'var(--accent)' : 'transparent' }}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'day' && <DayView payload={payload} />}
      {view === 'week' && <WeekView weekDays={weekDays} dayCache={dayCache} selfPayload={payload} selectedDate={selectedDate} />}
      {view === 'month' && <MonthView dt={dt} dayCache={dayCache} selfPayload={payload} selectedDate={selectedDate} />}
    </div>
  );
}

function dayHours(payload: CrmPayload): number[] {
  const hours = parseBusinessHours(payload.business.schedule);
  const start = hours ? Math.floor(toMin(hours.start) / 60) : 9;
  const end = hours ? Math.ceil(toMin(hours.end) / 60) : 19;
  return Array.from({ length: Math.max(1, end - start) }, (_, i) => start + i);
}

function DayView({ payload }: { payload: CrmPayload }) {
  const { t, lang } = useCRM();
  const { openBooking } = useData();
  const narrow = useNarrow(680);
  const [sel, setSel] = useState(0);
  const columns = payload.calendar.columns.filter((col) => col.id !== 0);
  const cols = narrow ? (columns[sel] ? [columns[sel]] : columns.slice(0, 1)) : columns;
  const HOURS = dayHours(payload);
  const dayStart = HOURS[0] * 60;
  const rowH = 76;
  const scale = rowH / 60;
  const gridCols = `60px repeat(${Math.max(cols.length, 1)}, 1fr)`;

  const bookingsFor = (staffId: number) => payload.calendar.bookings.filter((b) => (b.staffId ?? 0) === staffId && b.status !== 'cancelled');

  if (columns.length === 0) return <Panel><EmptyHint text={t.staff.title} /></Panel>;

  return (
    <div>
      {narrow && (
        <div className="noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
          {columns.map((s, i) => {
            const on = i === sel;
            return (
              <button key={s.id} onClick={() => setSel(i)} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13px 8px 8px', borderRadius: 999, background: on ? 'var(--accent)' : 'var(--panel)', border: on ? 'none' : '1px solid var(--line)', color: on ? 'var(--accent-ink)' : 'var(--ink)' }}>
                <Avatar name={s.name} color={avatarColor(s.name)} size={26} />
                <span style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{s.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      )}
      <Panel pad={0} className="crm-calwrap" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
          <div />
          {cols.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 18px 16px' }}>
              <Avatar name={s.name} color={avatarColor(s.name)} size={34} />
              <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{s.name.split(' ')[0]}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{s.role}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="scrollarea" style={{ display: 'grid', gridTemplateColumns: gridCols, maxHeight: 600, position: 'relative' }}>
          <div>
            {HOURS.map((h) => (
              <div key={h} style={{ height: rowH, position: 'relative' }}>
                <span className="tnum" style={{ position: 'absolute', top: -7, right: 12, fontSize: 11, fontWeight: 700, color: 'var(--ink-3)' }}>{String(h).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
          {cols.map((s) => (
            <div key={s.id} style={{ position: 'relative' }}>
              {HOURS.map((h, hi) => <div key={hi} style={{ height: rowH, borderTop: hi ? '1px solid var(--line)' : 'none' }} />)}
              {bookingsFor(s.id).map((b) => {
                const top = (toMin(b.time) - dayStart) * scale;
                const col = colorForId(b.serviceId ?? b.id);
                return (
                  <button key={b.id} onClick={() => openBooking(b)} className="cal-block" style={{ position: 'absolute', left: 8, right: 8, top: Math.max(0, top), height: Math.max(28, (b.duration || 30) * scale - 5), background: `color-mix(in srgb, ${col} 13%, var(--panel))`, borderRadius: 11, padding: '8px 11px 8px 15px', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                    <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: col }} />
                    <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' }}>{b.clientName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.serviceName}</div>
                    {(b.duration || 0) >= 45 && <div className="tnum" style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 'auto' }}>{b.time}</div>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function WeekView({ weekDays, dayCache, selfPayload, selectedDate }: { weekDays: string[]; dayCache: Record<string, CrmPayload>; selfPayload: CrmPayload; selectedDate: string }) {
  const { t } = useCRM();
  const { openBooking } = useData();
  const today = isoToday();
  const get = (date: string) => (date === selectedDate ? selfPayload : dayCache[date]);
  return (
    <Panel pad={0} className="crm-calwrap" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {weekDays.map((date, i) => {
          const dd = new Date(date + 'T00:00:00');
          const isToday = date === today;
          return (
            <div key={date} style={{ textAlign: 'center', padding: '16px 4px 14px', borderLeft: i ? '1px solid var(--line)' : 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{t.cal.weekdays[i]}</div>
              <div className="tnum" style={{ width: 30, height: 30, lineHeight: '30px', margin: '5px auto 0', borderRadius: '50%', fontSize: 14.5, fontWeight: 800, color: isToday ? 'var(--accent-ink)' : 'var(--ink)', background: isToday ? 'var(--accent)' : 'transparent' }}>{dd.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', minHeight: 320 }}>
        {weekDays.map((date, i) => {
          const p = get(date);
          const bookings = p ? p.calendar.bookings.filter((b) => b.status !== 'cancelled').slice(0, 12) : [];
          return (
            <div key={date} style={{ borderLeft: i ? '1px solid var(--line)' : 'none', borderTop: '1px solid var(--line)', padding: 8, display: 'flex', flexDirection: 'column', gap: 5, background: date === today ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'transparent' }}>
              {!p && <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 11, padding: 8 }}>…</div>}
              {bookings.map((b) => {
                const col = colorForId(b.serviceId ?? b.id);
                return (
                  <button key={b.id} onClick={() => openBooking(b)} className="cal-block" style={{ display: 'block', textAlign: 'left', background: `color-mix(in srgb, ${col} 14%, var(--panel))`, borderLeft: `3px solid ${col}`, borderRadius: 7, padding: '5px 8px', overflow: 'hidden' }}>
                    <div className="tnum" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-2)' }}>{b.time}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.clientName.split(' ')[0]}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function MonthView({ dt, dayCache, selfPayload, selectedDate }: { dt: Date; dayCache: Record<string, CrmPayload>; selfPayload: CrmPayload; selectedDate: string }) {
  const { t } = useCRM();
  const { setSelectedDate } = useData();
  const today = isoToday();
  const year = dt.getFullYear();
  const month = dt.getMonth();
  const daysIn = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const countFor = (d: number) => {
    const date = iso(d);
    const p = date === selectedDate ? selfPayload : dayCache[date];
    return p ? p.calendar.bookings.filter((b) => b.status !== 'cancelled').length : -1;
  };

  return (
    <Panel pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--line)' }}>
        {t.cal.weekdays.map((w: string, i: number) => (
          <div key={i} style={{ textAlign: 'center', padding: '12px 4px', fontSize: 11.5, fontWeight: 700, color: i >= 5 ? 'var(--ink-2)' : 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', borderLeft: i ? '1px solid var(--line)' : 'none' }}>{w}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr' }}>
        {cells.map((day, i) => {
          const dow = i % 7;
          const weekend = dow >= 5;
          const isToday = day != null && iso(day) === today;
          const n = day ? countFor(day) : -1;
          return (
            <div key={i} onClick={() => day && setSelectedDate(iso(day))} style={{ minHeight: 92, padding: '8px 9px', borderLeft: dow ? '1px solid var(--line)' : 'none', borderTop: i >= 7 ? '1px solid var(--line)' : 'none', background: !day ? 'var(--panel-2)' : weekend ? 'color-mix(in srgb, var(--panel-2) 45%, transparent)' : 'transparent', opacity: day ? 1 : 0.5, display: 'flex', flexDirection: 'column', gap: 6, cursor: day ? 'pointer' : 'default' }}>
              {day && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="tnum" style={{ width: 24, height: 24, lineHeight: '24px', textAlign: 'center', borderRadius: '50%', fontSize: 13, fontWeight: 800, color: isToday ? 'var(--accent-ink)' : 'var(--ink)', background: isToday ? 'var(--accent)' : 'transparent' }}>{day}</span>
                    {n > 0 && <span className="tnum" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)' }}>{n}</span>}
                  </div>
                  {n > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'color-mix(in srgb, var(--accent) 14%, var(--panel))', borderRadius: 5, padding: '2px 6px' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-deep)', flex: 'none' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-2)' }}>{n} {t.cal.bookingsWord}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ============ CUSTOMERS ============ */
function tierForClient(c: ClientRow): 'vip' | 'reg' | 'new' {
  if (c.totalVisits >= 15 || c.spentTotal >= 2_000_000) return 'vip';
  if (c.totalVisits <= 2) return 'new';
  return 'reg';
}

export function Customers() {
  const { t } = useCRM();
  const { payload, openClient } = useData();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  if (!payload) return null;
  const c = t.cust;
  const tierMap: Record<string, [string, string, string]> = { vip: ['var(--accent-deep)', 'var(--accent-tint)', c.vip], reg: ['var(--blue)', 'var(--blue-t)', c.reg], new: ['var(--violet)', 'var(--violet-t)', c.new] };
  const list = payload.clients.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()) && (tierFilter === 'all' || tierForClient(x) === tierFilter));
  const cust = payload.clients.find((x) => x.key === sel) || list[0] || payload.clients[0] || null;

  return (
    <div className="fadein crm-cust" style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
      <Panel pad={0} className="crm-tablewrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px' }}>
            <Ic name="search" size={16} style={{ color: 'var(--ink-3)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.colName + '…'} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, width: '100%', color: 'var(--ink)' }} />
          </div>
          <div style={{ position: 'relative', flex: 'none' }}>
            <button onClick={() => setFilterOpen((o) => !o)} style={{ width: 38, height: 38, borderRadius: 10, background: tierFilter !== 'all' || filterOpen ? 'var(--accent-tint)' : 'var(--panel-2)', border: '1px solid var(--line)', color: tierFilter !== 'all' ? 'var(--accent-deep)' : 'var(--ink-2)', display: 'grid', placeItems: 'center', position: 'relative' }}>
              <Ic name="filter" size={16} />
            </button>
            {filterOpen && (
              <>
                <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />
                <div style={{ position: 'absolute', top: 46, right: 0, width: 180, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 6, zIndex: 26, boxShadow: 'var(--shadow-lg)' }}>
                  {([['all', c.colStatus], ['vip', c.vip], ['reg', c.reg], ['new', c.new]] as const).map(([k, l]) => {
                    const on = tierFilter === k;
                    return (
                      <button key={k} onClick={() => { setTierFilter(k); setFilterOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, textAlign: 'left', background: on ? 'var(--accent-tint)' : 'transparent' }}>
                        {k !== 'all' && <span style={{ width: 9, height: 9, borderRadius: '50%', background: tierMap[k][0], flex: 'none' }} />}
                        <span style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--accent-deep)' : 'var(--ink)', flex: 1 }}>{l}</span>
                        {on && <Ic name="check" size={14} stroke={2.6} style={{ color: 'var(--accent-deep)' }} />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="crm-cust-head" style={{ display: 'grid', gridTemplateColumns: '2.4fr .8fr 1fr .9fr', gap: 12, padding: '10px 18px', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>{c.colName}</div><div>{c.colVisits}</div><div>{c.colSpent}</div><div>{c.colStatus}</div>
        </div>
        <div>
          {list.length === 0 && <EmptyHint text={c.title} />}
          {list.map((x) => {
            const on = (cust?.key ?? '') === x.key;
            const tier = tierForClient(x);
            const [tc, tt, tl] = tierMap[tier];
            return (
              <button key={x.key} onClick={() => setSel(x.key)} className="crm-cust-row" style={{ width: '100%', display: 'grid', gridTemplateColumns: '2.4fr .8fr 1fr .9fr', gap: 12, alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid var(--line)', textAlign: 'left', background: on ? 'var(--accent-tint)' : 'transparent', borderLeft: on ? '3px solid var(--accent-deep)' : '3px solid transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <Avatar name={x.name} color={avatarColor(x.name)} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{x.favoriteStaff}</div>
                  </div>
                </div>
                <div className="tnum" style={{ fontSize: 13.5, fontWeight: 800 }}>{x.totalVisits}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{fmtSom(x.spentTotal)}</div>
                <div><Badge color={tc} tint={tt} dot>{tl}</Badge></div>
              </button>
            );
          })}
        </div>
      </Panel>

      {cust && (
        <Panel style={{ position: 'sticky', top: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
            <Avatar name={cust.name} color={avatarColor(cust.name)} size={66} />
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 12 }}>{cust.name}</div>
            <div style={{ marginTop: 10 }}>
              <Badge color={tierMap[tierForClient(cust)][0]} tint={tierMap[tierForClient(cust)][1]} dot>{tierMap[tierForClient(cust)][2]}</Badge>
            </div>
            <button onClick={() => openClient(cust)} style={{ marginTop: 16, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 800, fontSize: 13, padding: '10px', borderRadius: 10 }}>
              <Ic name="clock" size={15} stroke={2.2} />{c.history}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '18px 0', borderBottom: '1px solid var(--line)' }}>
            {[[cust.totalVisits, c.detailVisits], [fmtSom(cust.spentTotal), c.detailSpent], [cust.cancelledVisits, c.detailNoshow]].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 800 }}>{s[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{s[1]}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 0' }}>
            <Avatar name={cust.favoriteStaff || '—'} color={avatarColor(cust.favoriteStaff || 'x')} size={36} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{c.pref}</div>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{cust.favoriteStaff || '—'}</div>
            </div>
          </div>
          <div style={{ paddingTop: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>{c.history}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {cust.history.slice(0, 5).map((v) => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorForId(v.id), flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.serviceName}</span>
                  <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{v.date.slice(5)}</span>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 800, width: 70, textAlign: 'right' }}>{fmtSom(v.price)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ============ STAFF ============ */
export function Staff() {
  const { t } = useCRM();
  const { payload, openStaffEditor, openSlots } = useData();
  if (!payload) return null;
  const s = t.staff;
  return (
    <div className="fadein" style={{ padding: 28 }}>
      {payload.employees.length === 0 ? (
        <Panel><EmptyHint text={s.title} /></Panel>
      ) : (
        <div className="crm-staff-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 18 }}>
          {payload.employees.map((p) => (
            <Panel key={p.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar name={p.name} color={avatarColor(p.name)} size={54} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 800 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>{p.role || s.role}</div>
                </div>
                <button onClick={() => openStaffEditor(p)} style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center' }}><Ic name="dots" size={18} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }}>
                {[[p.todayBookings + p.upcomingBookings, s.bookings], [fmtSom(p.completedRevenue), s.revenue], [Math.round(p.utilization) + '%', s.load]].map((mm, i) => (
                  <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 11, padding: '12px 10px', textAlign: 'center' }}>
                    <div className="tnum" style={{ fontSize: 16, fontWeight: 800 }}>{mm[0]}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{mm[1]}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>{p.weeklySlotCount} {s.slots.toLowerCase()} · {p.totalLinkedServices} {t.nav.services.toLowerCase()}</span>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: colorForId(p.id) }}>{Math.round(p.utilization)}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: Math.min(100, p.utilization) + '%', height: '100%', background: colorForId(p.id) }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={() => openStaffEditor(p)} style={btnGhost}>{s.edit}</button>
                <button onClick={() => openSlots(p)} style={btnGhost}>{s.slots}</button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
const btnGhost = { flex: 1, fontSize: 13, fontWeight: 800, padding: '9px', borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink)' } as const;

/* ============ SERVICES ============ */
export function Services() {
  const { t } = useCRM();
  const { payload, openServiceEditor, toggleServiceActive } = useData();
  if (!payload) return null;
  const sv = t.serv;
  return (
    <div className="fadein" style={{ padding: 28 }}>
      <Panel pad={0} className="crm-tablewrap">
        <div className="crm-serv-head" style={{ display: 'grid', gridTemplateColumns: '2.4fr 1.2fr 1fr 1.1fr 1.2fr', gap: 12, padding: '14px 22px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>{sv.colName}</div><div>{t.staff.title}</div><div>{sv.colDur}</div><div>{sv.colPrice}</div><div style={{ textAlign: 'right' }}>{sv.colBookings}</div>
        </div>
        {payload.services.length === 0 && <EmptyHint text={sv.title} />}
        {payload.services.map((x, i) => (
          <div key={x.id} className="crm-serv-row" style={{ display: 'grid', gridTemplateColumns: '2.4fr 1.2fr 1fr 1.1fr 1.2fr', gap: 12, alignItems: 'center', padding: '15px 22px', borderTop: i ? '1px solid var(--line)' : 'none', opacity: x.isActive ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${colorForId(x.id)} 16%, var(--panel))`, color: colorForId(x.id), display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="scissors" size={18} stroke={2} /></span>
              <span style={{ fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.linkedStaffNames.length ? x.linkedStaffNames.join(', ') : '—'}</div>
            <div className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 5 }}><Ic name="clock" size={14} stroke={2} style={{ color: 'var(--ink-3)' }} />{x.duration} {sv.min}</div>
            <div className="tnum" style={{ fontSize: 14, fontWeight: 800 }}>{fmtSom(x.price)} <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>UZS</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              <span className="tnum" style={{ fontSize: 14, fontWeight: 800 }}>{x.bookingsCount}</span>
              <button onClick={() => openServiceEditor(x)} title={sv.edit} style={{ color: 'var(--ink-3)' }}><Ic name="dots" size={18} /></button>
              <Switch on={x.isActive} onChange={() => toggleServiceActive(x)} />
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ============ FINANCE ============ */
export function Finance() {
  const { t } = useCRM();
  const { payload } = useData();
  if (!payload) return null;
  const f = t.fin;
  const txns = dayPayments(payload).filter((p) => p.flow === 'in');
  const methodMeta: Record<string, [string, string, string, string]> = {
    cash: ['var(--accent-deep)', 'var(--accent-tint)', f.cash, 'wallet'],
    card: ['var(--blue)', 'var(--blue-t)', f.card, 'finance'],
    transfer: ['var(--violet)', 'var(--violet-t)', f.transfer, 'send'],
    other: ['var(--amber)', 'var(--amber-t)', f.other, 'dots'],
  };
  const totals: Record<string, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  txns.forEach((tx) => { totals[tx.method] = (totals[tx.method] || 0) + tx.amount; });
  const total = txns.reduce((a, x) => a + x.amount, 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="crm-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {[
          [f.today, fmtSom(payload.analytics.collectedToday), 'finance', 'var(--accent-deep)', 'var(--accent-tint)'],
          [f.cash, fmtSom(totals.cash), 'wallet', 'var(--accent-deep)', 'var(--accent-tint)'],
          [f.card, fmtSom(totals.card), 'finance', 'var(--blue)', 'var(--blue-t)'],
          [f.avgCheck, fmtSom(txns.length ? total / txns.length : 0), 'trend', 'var(--violet)', 'var(--violet-t)'],
        ].map((k, i) => (
          <Panel key={i} pad={18}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: k[4], color: k[3], display: 'grid', placeItems: 'center' }}><Ic name={k[2]} size={20} stroke={2} /></span>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', marginTop: 12 }}>{k[1]} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>UZS</span></div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{k[0]}</div>
          </Panel>
        ))}
      </div>

      <div className="crm-dash-2col" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        <Panel pad={0}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{f.txns}</div>
            <Badge color="var(--ink-2)" tint="var(--panel-2)">{txns.length} {f.count}</Badge>
          </div>
          {txns.length === 0 ? (
            <EmptyHint text={f.noTxns} />
          ) : (
            txns.slice(0, 12).map((tx, i) => {
              const mm = methodMeta[tx.method] || methodMeta.other;
              return (
                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 20px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <Avatar name={tx.clientName} color={avatarColor(tx.clientName)} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.clientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{tx.serviceName}</div>
                  </div>
                  <Badge color={mm[0]} tint={mm[1]} dot>{mm[2]}</Badge>
                  <div className="tnum crm-hide-sm" style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, width: 46, textAlign: 'right' }}>{tx.createdAt.slice(11, 16)}</div>
                  <div className="tnum" style={{ fontSize: 14, fontWeight: 800, width: 100, textAlign: 'right' }}>{fmtSom(tx.amount)}</div>
                </div>
              );
            })
          )}
        </Panel>

        <Panel>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>{f.byMethod}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(['cash', 'card', 'transfer', 'other'] as const).map((mk) => {
              const mm = methodMeta[mk];
              return (
                <div key={mk}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: mm[1], color: mm[0], display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name={mm[3]} size={15} stroke={2} /></span>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{mm[2]}</span>
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: 800 }}>{pct(totals[mk] || 0)}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: pct(totals[mk] || 0) + '%', height: '100%', background: mm[0] }} />
                  </div>
                  <div className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 4 }}>{fmtSom(totals[mk] || 0)} UZS</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============ ANALYTICS ============ */
export function Analytics() {
  const { t } = useCRM();
  const { payload } = useData();
  if (!payload) return null;
  const a = t.an;
  const an = payload.analytics;
  const topServ = [...payload.services].sort((x, y) => y.completedRevenue - x.completedRevenue).slice(0, 6);
  const maxServ = topServ[0]?.completedRevenue || 1;
  const empMax = an.employeeRevenue[0]?.revenue || 1;

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="crm-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {[
          [fmtSom(an.totalRevenue), a.totalRevenue],
          [fmtSom(an.monthlyRevenue), a.monthRevenue],
          [fmtSom(an.collectedToday), a.collectedToday],
          [fmtSom(an.totalOutstanding), a.outstanding],
        ].map((k, i) => (
          <Panel key={i} pad={18}>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{k[1]}</div>
            <div className="tnum" style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.03em', marginTop: 6 }}>{k[0]} <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>UZS</span></div>
          </Panel>
        ))}
      </div>

      <div className="crm-an-3col" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <Panel>
          <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 16 }}>{a.topServices}</div>
          {topServ.length === 0 ? (
            <EmptyHint text={t.serv.title} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {topServ.map((sv, i) => (
                <div key={sv.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: colorForId(sv.id), flex: 'none' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sv.name}</span>
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800 }}>{fmtSom(sv.completedRevenue)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: (sv.completedRevenue / maxServ) * 100 + '%', height: '100%', background: colorForId(sv.id) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 16 }}>{a.topStaff}</div>
          {an.employeeRevenue.length === 0 ? (
            <EmptyHint text={t.staff.title} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {an.employeeRevenue.slice(0, 6).map((item, i) => (
                <div key={item.staffId}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', width: 14 }}>{i + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.staffName}</span>
                    <span className="tnum" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800 }}>{fmtSom(item.revenue)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: Math.max(6, (item.revenue / empMax) * 100) + '%', height: '100%', background: colorForId(item.staffId) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ============ SETTINGS ============ */
function QRBlock({ link }: { link: string }) {
  const { t } = useCRM();
  const s = t.set;
  const url = link.startsWith('http') ? link : 'https://' + link;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&qzone=1&data=${encodeURIComponent(url)}&color=20-24-33&bgcolor=255-255-255`;
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginTop: 18 }}>
      <div style={{ background: '#fff', padding: 10, borderRadius: 12, flex: 'none', boxShadow: 'var(--shadow-sm)', lineHeight: 0 }}>
        <img src={qrUrl} alt="QR" width="118" height="118" style={{ display: 'block', borderRadius: 4 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="grid" size={16} stroke={2} style={{ color: 'var(--accent-deep)' }} />{s.qr}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, margin: '3px 0 12px' }}>{s.qrSub}</div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <a href={qrUrl} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, padding: '9px 15px', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)' }}>
            <Ic name="download" size={15} stroke={2.2} />{s.download}
          </a>
          <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, padding: '9px 15px', borderRadius: 10, background: 'var(--panel)', color: 'var(--ink)', border: '1px solid var(--line-2)' }}>
            <Ic name="printer" size={15} stroke={2} />{s.print}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const { t, lang, setLang, theme, setTheme } = useCRM();
  const { payload, openBusinessEditor, openCredentialsEditor, uploadBusinessPhoto, deleteBusinessPhoto } = useData();
  const [sec, setSec] = useState('profile');
  const [copied, setCopied] = useState(false);
  if (!payload) return null;
  const s = t.set;
  const b = payload.business;
  const publicLink = payload.bookingLinks.find((l) => l.kind === 'public');
  const link = publicLink?.url || '';
  const copy = () => { try { navigator.clipboard.writeText(link); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const navItems: Array<[string, string]> = [['profile', 'user'], ['booking', 'grid'], ['appearance', 'sun']];

  return (
    <div className="fadein" style={{ padding: 28 }}>
      <div className="crm-set" style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 24, alignItems: 'start', maxWidth: 960 }}>
        <Panel pad={8} style={{ position: 'sticky', top: 20 }}>
          {navItems.map(([k, ic]) => {
            const on = sec === k;
            return (
              <button key={k} onClick={() => setSec(k)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 11, textAlign: 'left', fontSize: 14, fontWeight: on ? 800 : 600, marginBottom: 2, color: on ? 'var(--accent-ink)' : 'var(--ink-2)', background: on ? 'var(--accent)' : 'transparent' }}>
                <Ic name={ic} size={18} stroke={on ? 2.2 : 1.9} />{s.nav[k]}
              </button>
            );
          })}
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {sec === 'profile' && (
            <Panel>
              <SetHead title={s.profile} sub={s.profileSub} />
              <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: 96, height: 96, borderRadius: 16, overflow: 'hidden', flex: 'none', background: 'var(--panel-2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>
                  {b.photoFileId ? (
                    <img src={`/api/business/photo?v=${encodeURIComponent(payload.generatedAt)}`} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink-3)' }}>{b.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={uploadBusinessPhoto} style={{ fontSize: 13, fontWeight: 800, padding: '9px 15px', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)' }}>{b.photoFileId ? s.download : s.download}</button>
                  {b.photoFileId && <button onClick={deleteBusinessPhoto} style={{ fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--rose)' }}>{t.serv.archive}</button>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginTop: 18 }}>
                {[[s.bizName, b.name], [s.category, b.type], [s.phone, b.phone], [s.address, b.address], [s.schedule, b.schedule], [s.description, b.description || '—']].map(([label, val], i) => (
                  <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 12, padding: '12px 14px', gridColumn: i >= 3 ? 'span 2' : 'auto' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                <button onClick={openBusinessEditor} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 11 }}><Ic name="settings" size={16} stroke={2} />{s.save}</button>
                <button onClick={openCredentialsEditor} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 11 }}><Ic name="user" size={16} stroke={2} />{s.credentials}</button>
              </div>
              {b.crmHasTemporaryPassword && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--amber)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}><Ic name="bell" size={14} stroke={2} />{s.tempPassword}</div>
              )}
            </Panel>
          )}

          {sec === 'booking' && (
            <Panel>
              <SetHead title={s.booking} sub={s.bookingSub} />
              {link && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', margin: '18px 0 6px' }}>
                  <Ic name="grid" size={16} stroke={2} style={{ color: 'var(--accent-deep)', flex: 'none' }} />
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
                  <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, padding: '7px 13px', borderRadius: 9, background: copied ? 'var(--accent)' : 'var(--panel)', color: copied ? 'var(--accent-ink)' : 'var(--ink)', border: '1px solid var(--line-2)', whiteSpace: 'nowrap' }}>
                    <Ic name={copied ? 'check' : 'dots'} size={14} stroke={2.4} />{copied ? s.copied : s.copy}
                  </button>
                  <a href={link} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, padding: '7px 13px', borderRadius: 9, background: 'var(--ink)', color: 'var(--panel)', whiteSpace: 'nowrap' }}>
                    <Ic name="send" size={14} stroke={2.2} />{s.open}
                  </a>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {payload.bookingLinks.map((bl) => (
                  <a key={bl.id} href={bl.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-tint)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name={bl.kind === 'public' ? 'send' : bl.kind === 'admin' ? 'user' : 'grid'} size={17} stroke={2} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bl.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bl.subtitle}</div>
                    </div>
                    <Ic name="chevR" size={16} style={{ color: 'var(--ink-3)', flex: 'none' }} />
                  </a>
                ))}
              </div>
              {link && <QRBlock link={link} />}
            </Panel>
          )}

          {sec === 'appearance' && (
            <Panel>
              <SetHead title={s.appearance} sub={s.appearanceSub} />
              <div style={{ marginTop: 10 }}>
                <SetRow first title={s.language}>
                  <div style={{ display: 'inline-flex', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3, gap: 2 }}>
                    {(['uz', 'ru', 'en'] as const).map((code) => {
                      const labels = { uz: 'O‘z', ru: 'Рус', en: 'Eng' };
                      const on = code === lang;
                      return <button key={code} onClick={() => setLang(code)} style={{ fontSize: 13, fontWeight: 700, padding: '6px 13px', borderRadius: 999, color: on ? 'var(--accent-ink)' : 'var(--ink-3)', background: on ? 'var(--accent)' : 'transparent' }}>{labels[code]}</button>;
                    })}
                  </div>
                </SetRow>
                <SetRow title={s.theme}>
                  <div style={{ display: 'inline-flex', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3, gap: 2 }}>
                    {([['light', s.light, 'sun'], ['dark', s.dark, 'moon']] as const).map(([k, l, ic]) => {
                      const on = theme === k;
                      return <button key={k} onClick={() => setTheme(k as any)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '6px 13px', borderRadius: 999, color: on ? 'var(--accent-ink)' : 'var(--ink-3)', background: on ? 'var(--accent)' : 'transparent' }}><Ic name={ic} size={14} stroke={2} />{l}</button>;
                    })}
                  </div>
                </SetRow>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
