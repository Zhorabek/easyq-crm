import { useEffect, useMemo, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';
import { Avatar, Badge, Donut, InfoTip, Panel, SetField, SetHead, SetRow, setInput, StatusBadge, Switch } from './ui';
import { avatarColor, colorForId, fmtPrice, fmtSom, serviceSummary, useData } from './data';
import { addDays, isoToday, parseBusinessHours } from '../lib/date';
import { formatPhone } from '../shared/phone';
import { BOOKING_FLOWS, type BookingFlow } from '../shared/bookingFlow';
import { updateBusinessProfile } from '../lib/api';
import {
  BRAND_PRESETS, BRAND_THEME_PRESETS, DEFAULT_BRAND_COLOR, DEFAULT_BRAND_THEME, MIN_TEXT_CONTRAST,
  brandTokens, isValidBrandColor, normalizeBrandColor, normalizeBrandTheme, themeTextContrast,
} from '../shared/brand';
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
            {/* Translated here, from a key. The Worker sends no prose — see KpiCard. */}
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center' }}>
              {t.dash.live[k.labelKey]}
              <InfoTip text={t.dash.live[`${k.labelKey}Tip`]} />
            </div>
            {(() => {
              const hint = t.dash.live[`${k.labelKey}Hint`];
              const text = typeof hint === 'function' ? hint(...(k.hintValues ?? [])) : hint;
              return text ? <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginTop: 4 }}>{text}</div> : null;
            })()}
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
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{serviceSummary(b.services, b.serviceName)} · {b.staffName.split(' ')[0]}</div>
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
      {view === 'month' && (
        <MonthView
          dt={dt}
          dayCache={dayCache}
          selfPayload={payload}
          selectedDate={selectedDate}
          onPickDay={(date) => { setSelectedDate(date); setView('day'); }}
        />
      )}
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
          {cols.map((s) => {
            // id 0 is the bucket for bookings with nobody assigned. The worker sends it
            // nameless on purpose — it cannot know which language to name it in.
            const colName = s.id === 0 ? t.cal.noStaff : s.name;
            const colRole = s.id === 0 ? t.cal.noStaffRole : s.role;
            return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 18px 16px' }}>
              <Avatar name={colName} color={avatarColor(colName)} size={34} />
              <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{colName.split(' ')[0]}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{colRole}</div>
              </div>
            </div>
          );
          })}
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
                    <div style={{ fontSize: 11, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{serviceSummary(b.services, b.serviceName)}</div>
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

/**
 * `onPickDay` switches to the DAY view as well as selecting the date.
 *
 * Clicking a day used to call setSelectedDate and nothing else, so the month grid stayed on
 * screen and looked completely unresponsive — the bookings you had just clicked were now
 * loaded, one view away, with no way of knowing it. Tapping "2 navbat" means "show me those
 * two", so that is what it does.
 */
function MonthView({ dt, dayCache, selfPayload, selectedDate, onPickDay }: { dt: Date; dayCache: Record<string, CrmPayload>; selfPayload: CrmPayload; selectedDate: string; onPickDay: (date: string) => void }) {
  const { t } = useCRM();
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
            <div key={i} onClick={() => day && onPickDay(iso(day))} style={{ minHeight: 92, padding: '8px 9px', borderLeft: dow ? '1px solid var(--line)' : 'none', borderTop: i >= 7 ? '1px solid var(--line)' : 'none', background: !day ? 'var(--panel-2)' : weekend ? 'color-mix(in srgb, var(--panel-2) 45%, transparent)' : 'transparent', opacity: day ? 1 : 0.5, display: 'flex', flexDirection: 'column', gap: 6, cursor: day ? 'pointer' : 'default' }}>
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
  const { t, role } = useCRM();
  /**
   * A specialist's copy of this screen shows only their own clients, with money stripped —
   * `spentTotal` arrives as 0 and `favoriteStaff` as "—" for every row (see
   * clientsScopedToStaff in worker.ts). Rendering the owner's layout over that gives a column
   * of zeros and a "preferred specialist" panel that is always a dash, so those two are
   * swapped for the facts they DO have: when the client last came, and what is booked next.
   *
   * Cosmetic only. The server decides what is in the payload; this decides how to show it.
   */
  const scoped = role === 'specialist';
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
          <div>{c.colName}</div><div>{c.colVisits}</div><div>{scoped ? c.colLast : c.colSpent}</div><div>{c.colStatus}</div>
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
                    <div className={scoped ? 'tnum' : undefined} style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>
                      {scoped ? (x.phone ? formatPhone(x.phone) : '—') : x.favoriteStaff}
                    </div>
                  </div>
                </div>
                <div className="tnum" style={{ fontSize: 13.5, fontWeight: 800 }}>{x.totalVisits}</div>
                <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
                  {scoped ? (x.lastVisit ? x.lastVisit.slice(0, 10) : '—') : fmtSom(x.spentTotal)}
                </div>
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
            {(scoped
              ? ([[cust.totalVisits, c.detailVisits], [cust.upcomingVisits, c.detailUpcoming], [cust.cancelledVisits, c.detailNoshow]] as Array<[string | number, string]>)
              : ([[cust.totalVisits, c.detailVisits], [fmtSom(cust.spentTotal), c.detailSpent], [cust.cancelledVisits, c.detailNoshow]] as Array<[string | number, string]>)
            ).map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="tnum" style={{ fontSize: 17, fontWeight: 800 }}>{s[0]}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{s[1]}</div>
              </div>
            ))}
          </div>
          <div style={{ display: scoped ? 'none' : 'flex', alignItems: 'center', gap: 11, padding: '14px 0' }}>
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
                  <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{serviceSummary(v.services, v.serviceName)}</span>
                  <span className="tnum" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{v.date.slice(5)}</span>
                  <span className="tnum" style={{ fontSize: 12.5, fontWeight: 800, width: 70, textAlign: 'right' }}>{fmtPrice(v.price) ?? ''}</span>
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
/**
 * A specialist's photo, or their initials, with the upload hidden behind it.
 *
 * `hasPhoto` decides whether to request the image at all — an <img> that 404s would flash a
 * broken icon on every card for a team with no photos yet. Cache-busted on `generatedAt` for
 * the same reason the logo is: the URL does not change when the file behind it does.
 */
function StaffPhoto({
  employee,
  version,
  onUpload,
  onRemove,
  removeLabel,
  uploadLabel,
  replaceLabel,
}: {
  employee: EmployeeRow;
  version: string;
  onUpload: (() => void) | null;
  onRemove: (() => void) | null;
  removeLabel: string;
  uploadLabel: string;
  replaceLabel: string;
}) {
  const SIZE = 54;
  // The row's own timestamp when there is one, so replacing a photo busts the cache exactly.
  // `generatedAt` is the fallback for a photo that lives in Telegram rather than crm_images.
  const cacheKey = employee.photoVersion ?? version;
  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, flex: 'none' }}>
      {/* The whole circle is the upload target, not just the little badge — same gesture as
          the service tile, so there is one thing to learn in the product rather than two. */}
      <button
        onClick={onUpload ?? undefined}
        disabled={!onUpload}
        title={onUpload ? (employee.hasPhoto ? replaceLabel : uploadLabel) : undefined}
        className={onUpload ? 'crm-photo-tile' : undefined}
        style={{
          // No overflow:hidden. The upload badge is deliberately positioned OUTSIDE this box
          // (right/bottom -2) and a clip here removed a bite from its circle and all of its
          // white ring on those sides — which is what made the icon look off-centre when it
          // was pixel-perfect. The photo clips itself instead, via its own border-radius.
          width: SIZE, height: SIZE, borderRadius: '50%', position: 'relative',
          display: 'block', padding: 0, border: 'none', background: 'transparent',
          cursor: onUpload ? 'pointer' : 'default',
        }}
      >
        {employee.hasPhoto ? (
          <img
            src={`/api/staff/${employee.id}/photo?v=${encodeURIComponent(cacheKey)}`}
            alt={employee.name}
            style={{ width: SIZE, height: SIZE, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Avatar name={employee.name} color={avatarColor(employee.name)} size={SIZE} />
        )}
        {onUpload && (
          <span className="crm-photo-tile-hover" style={{ borderRadius: '50%' }}>
            <Ic name="camera" size={18} stroke={2} />
          </span>
        )}
      </button>

      {onUpload && (
        <button
          onClick={onUpload}
          title={employee.hasPhoto ? replaceLabel : uploadLabel}
          style={{
            position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: '50%',
            background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center',
            border: '2px solid var(--panel)',
          }}
        >
          <Ic name="camera" size={11} stroke={2.4} />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          title={removeLabel}
          style={{
            position: 'absolute', left: -2, bottom: -2, width: 22, height: 22, borderRadius: '50%',
            background: 'var(--panel)', color: 'var(--rose)', display: 'grid', placeItems: 'center',
            border: `1px solid var(--line-2)`,
          }}
        >
          <Ic name="x" size={11} stroke={3} />
        </button>
      )}
    </div>
  );
}

/**
 * The clients who have booked with one master, newest first, with the visit counts scoped to
 * that master rather than the shop.
 *
 * Derived here from `history` instead of asking the API for it. The payload already carries
 * every client's full history, so a `staffClients` field would be the same rows sent twice,
 * and a separate endpoint would be a round trip for data already in memory. `staffId` is the
 * key, not `staffName`: the name on a booking is a snapshot, so it keeps the old spelling
 * after a rename and cannot tell two people with the same name apart.
 */
function clientsOfStaff(clients: ClientRow[], staffId: number) {
  const rows = clients
    .map((client) => {
      const mine = client.history.filter((item) => item.staffId === staffId);
      if (mine.length === 0) return null;
      return {
        client,
        visits: mine.length,
        // Their last visit TO THIS MASTER, which is the question being asked. The client's
        // own `lastVisit` is shop-wide and would show a date they saw somebody else.
        lastVisit: mine.reduce((latest, item) => (item.datetime > latest ? item.datetime : latest), ''),
      };
    })
    .filter((row): row is { client: ClientRow; visits: number; lastVisit: string } => row !== null);
  return rows.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
}

export function Staff() {
  const { t, role } = useCRM();
  const { payload, openStaffEditor, openSlots, openClient, openBookingFor, uploadStaffPhoto, deleteStaffPhoto } = useData();
  // Which master's client list is expanded. One at a time: the cards sit in a two-column
  // grid, and letting several open at once makes the row heights jump around.
  const [clientsOpen, setClientsOpen] = useState<number | null>(null);
  if (!payload) return null;
  const s = t.staff;
  return (
    <div className="fadein" style={{ padding: 28 }}>
      {payload.employees.length === 0 ? (
        <Panel><EmptyHint text={s.title} /></Panel>
      ) : (
        <div className="crm-staff-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 18 }}>
          {payload.employees.map((p) => {
            const mine = clientsOfStaff(payload.clients, p.id);
            const open = clientsOpen === p.id;
            return (
            <Panel key={p.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* The photo doubles as the upload control: a specialist's picture is the one
                    thing on this card you change by pointing at it, so a separate button would
                    be a second place to look. Owner-only, matching staff:write. */}
                <StaffPhoto
                  employee={p}
                  version={payload.generatedAt}
                  onUpload={role === 'owner' ? () => uploadStaffPhoto(p.id) : null}
                  onRemove={role === 'owner' && p.hasPhoto ? () => deleteStaffPhoto(p.id) : null}
                  removeLabel={s.photoRemove}
                  uploadLabel={s.photoUpload}
                  replaceLabel={s.photoReplaceStaff}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 800 }}>{p.name}</div>
                  {/* `s.role` is the field LABEL, so the old fallback printed "Role" as
                      somebody's job title. `s.noRole` is the actual placeholder. */}
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.role || s.noRole}</div>
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="tnum" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-deep)', marginTop: 3 }}>
                      <Ic name="phone" size={12} stroke={2.2} />{formatPhone(p.phone)}
                    </a>
                  )}
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
              {/* Who this master's clients are, folded away by default. The count is on the
                  button so it answers "how many regulars has she built up?" without a click,
                  which is most of what the owner wants from this. */}
              <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <button
                  onClick={() => setClientsOpen(open ? null : p.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left' }}
                >
                  <Ic name="customers" size={16} stroke={2.2} style={{ color: 'var(--ink-3)', flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>{s.clients}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>{mine.length}</span>
                  <Ic name={open ? 'chevD' : 'chevR'} size={15} stroke={2.4} style={{ color: 'var(--ink-3)', flex: 'none' }} />
                </button>

                {open && (
                  <div style={{ marginTop: 12 }}>
                    {mine.length === 0 ? (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', padding: '4px 0 2px' }}>{s.noClients}</div>
                    ) : (
                      <div className="scrollarea noscroll" style={{ maxHeight: 232, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {mine.map(({ client, visits, lastVisit }) => (
                          <button
                            key={client.key}
                            onClick={() => openClient(client)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 9, textAlign: 'left', width: '100%' }}
                          >
                            <Avatar name={client.name} color={avatarColor(client.name)} size={30} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</div>
                              {/* The phone is the point of this list for an owner covering a
                                  sick master's day: they need to ring these people. */}
                              <div className="tnum" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)' }}>
                                {client.phone ? formatPhone(client.phone) : lastVisit.slice(5, 10)}
                              </div>
                            </div>
                            <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', flex: 'none' }}>
                              {visits} · {lastVisit.slice(5, 10)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => openStaffEditor(p)} style={btnGhost}>{s.edit}</button>
                <button onClick={() => openSlots(p)} style={btnGhost}>{s.slots}</button>
                {/* Straight into the booking modal with this master already chosen — from
                    here the master IS the context, so re-picking them in the modal is a step
                    that exists only because the modal was built to be opened from elsewhere. */}
                <button onClick={() => openBookingFor(p.id)} style={btnGhost}>{t.cust.book}</button>
              </div>
            </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btnGhost = { flex: 1, fontSize: 13, fontWeight: 800, padding: '9px', borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink)' } as const;

/* ============ SERVICES ============ */
export function Services() {
  const { t } = useCRM();
  const { payload, openServiceEditor, toggleServiceActive, uploadServicePhoto, deleteServicePhoto } = useData();
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
              {/* The tile is the picture AND the upload button, which only works if it LOOKS
                  like a button. The first version was a bare tile and you had to already know
                  it was clickable — an invisible affordance is the same as no affordance.
                  So: a camera badge always sits in the corner, and hovering covers the tile
                  with a camera over a scrim. Both say "this takes a picture" before you click. */}
              <button
                onClick={() => uploadServicePhoto(x.id)}
                title={x.hasPhoto ? sv.photoReplace : sv.photoHint}
                className="crm-photo-tile"
                style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', position: 'relative', cursor: 'pointer', background: `color-mix(in srgb, ${colorForId(x.id)} 16%, var(--panel))`, color: colorForId(x.id), display: 'grid', placeItems: 'center' }}
              >
                {x.hasPhoto
                  ? <img src={`/api/services/${x.id}/photo?v=${encodeURIComponent(x.photoVersion ?? '')}`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                  : <Ic name="scissors" size={18} stroke={2} />}

                <span className="crm-photo-tile-hover">
                  <Ic name="camera" size={15} stroke={2} />
                </span>

                <span className="crm-photo-tile-badge">
                  <Ic name={x.hasPhoto ? 'camera' : 'plus'} size={9} stroke={3} />
                </span>
              </button>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
                {x.category && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)' }}>{x.category}</span>}
              </span>
            </div>
            {/* A service with nobody assigned is not on the booking page at all — there is no
                one to give it to. That used to be hidden behind a dash while the public page
                quietly offered the whole team instead, so the dash now says what it means. */}
            {x.linkedStaffNames.length > 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.linkedStaffNames.join(', ')}</div>
            ) : (
              <div title={sv.noStaffHint} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--amber)', fontWeight: 700, minWidth: 0 }}>
                <Ic name="bell" size={13} stroke={2.2} style={{ flex: 'none' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sv.noStaff}</span>
              </div>
            )}
            <div className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 5 }}><Ic name="clock" size={14} stroke={2} style={{ color: 'var(--ink-3)' }} />{x.duration} {sv.min}</div>
            {/* A dash, not "0 UZS": zero here means the owner has not set a price. The unit is
                part of the price, so it goes too. */}
            <div className="tnum" style={{ fontSize: 14, fontWeight: 800 }}>
              {fmtPrice(x.price)
                ? <>{fmtPrice(x.price)} <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>UZS</span></>
                : <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>—</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
              <span className="tnum" style={{ fontSize: 14, fontWeight: 800 }}>{x.bookingsCount}</span>
              {x.hasPhoto && (
                <button onClick={() => deleteServicePhoto(x.id)} title={sv.photoRemove} style={{ color: 'var(--ink-3)' }}>
                  <Ic name="trash" size={16} stroke={2} />
                </button>
              )}
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
  // payload.paymentsToday, not the day's bookings: the server filters on when the money was
  // TAKEN, which is the same basis as the headline total right above these cards.
  const txns = (payload.paymentsToday ?? []).filter((p) => p.flow === 'in');
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

/**
 * The booking link, the other share links, and the QR code.
 *
 * Module scope because TWO screens need it. It lives on Branding for owners — the link and the
 * brand are two halves of what a customer sees — and on Settings for managers, who have no
 * Branding screen because it needs `business:write`.
 *
 * That gap was real: moving this panel to Branding took the booking link away from the people
 * who spend all day sending it to customers. A manager could run the shop but not answer "where
 * do I book?".
 *
 * Rendering nothing when there are no links is what keeps this honest for specialists: the
 * worker sends them `bookingLinks: []` on purpose, so they get an empty section rather than a
 * link the server decided was not theirs. The gate stays on the server; this just does not draw
 * an empty box.
 */
function BookingLinkPanel() {
  const { t } = useCRM();
  const { payload } = useData();
  // Keyed by which row was copied, not a single boolean: with one flag, copying the client bot
  // link lit up "Copied" on the booking link too.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const s = t.set;

  if (!payload || payload.bookingLinks.length === 0) return null;

  // Prefer the business's own booking page for the headline link and the QR. It only exists
  // once a slug is assigned; before that fall back to the generic client bot, which is the
  // best available answer to "what do I send my customers?".
  const publicLink =
    payload.bookingLinks.find((l) => l.id === 'public-booking') ?? payload.bookingLinks.find((l) => l.kind === 'public');
  const link = publicLink?.url || '';
  const copy = (value: string, id: string) => {
    try { navigator.clipboard.writeText(value); } catch { /* clipboard blocked */ }
    setCopiedId(id);
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
  };

  return (
    <Panel>
      <SetHead title={s.booking} sub={s.bookingSub} />
      {link && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', margin: '18px 0 6px' }}>
          <Ic name="grid" size={16} stroke={2} style={{ color: 'var(--accent-deep)', flex: 'none' }} />
          <span className="mono" style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
          <button onClick={() => copy(link, 'headline')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, padding: '7px 13px', borderRadius: 9, background: copiedId === 'headline' ? 'var(--accent)' : 'var(--panel)', color: copiedId === 'headline' ? 'var(--accent-ink)' : 'var(--ink)', border: '1px solid var(--line-2)', whiteSpace: 'nowrap' }}>
            <Ic name={copiedId === 'headline' ? 'check' : 'copy'} size={14} stroke={2.4} />{copiedId === 'headline' ? s.copied : s.copy}
          </button>
          <a href={link} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, padding: '7px 13px', borderRadius: 9, background: 'var(--ink)', color: 'var(--panel)', whiteSpace: 'nowrap' }}>
            <Ic name="send" size={14} stroke={2.2} />{s.open}
          </a>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {payload.bookingLinks.map((bl) => (
          /* A row, not one big <a>. Every one of these is meant to be SENT to somebody — the
             client bot link most of all — and the only way to send it was to open it and copy
             out of the address bar. A copy button cannot be nested inside a link, so the row
             is a flex container with the link as its tappable left side. */
          <div key={bl.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
            <a
              href={bl.url}
              target="_blank"
              rel="noopener"
              style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, color: 'inherit' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-tint)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name={bl.id === 'public-booking' ? 'grid' : bl.kind === 'admin' ? 'user' : 'send'} size={17} stroke={2} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                {/* Title comes from a key, not the payload — the worker cannot know
                    which language this reader uses. */}
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.links[bl.titleKey]}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bl.url.replace(/^https?:\/\//, '')}</div>
              </div>
            </a>
            <button
              onClick={() => copy(bl.url, bl.id)}
              title={s.copy}
              aria-label={s.copy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', fontSize: 12.5, fontWeight: 800, padding: '7px 12px', borderRadius: 9, background: copiedId === bl.id ? 'var(--accent)' : 'var(--panel)', color: copiedId === bl.id ? 'var(--accent-ink)' : 'var(--ink)', border: '1px solid var(--line-2)', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              <Ic name={copiedId === bl.id ? 'check' : 'copy'} size={14} stroke={2.4} />
              {copiedId === bl.id ? s.copied : s.copy}
            </button>
          </div>
        ))}
      </div>
      {link && <QRBlock link={link} />}
    </Panel>
  );
}

/**
 * One colour of the theme: native picker, hex field, and optional quick swatches.
 *
 * Module scope, not nested in Settings — a component declared inside another is a new type
 * on every render, so React unmounts and remounts it and the hex input loses focus after
 * the first keystroke.
 */
function BrandField({ label, value, swatches, onChange }: {
  label: string;
  value: string;
  swatches?: string[];
  onChange: (value: string) => void;
}) {
  const valid = isValidBrandColor(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 168 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* The native picker writes a valid hex by construction; the text field beside it
            is for pasting a colour out of a style guide. */}
        <input
          type="color"
          value={valid ? normalizeBrandColor(value)! : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 40, padding: 0, border: '1px solid var(--line-2)', borderRadius: 10, background: 'none', flex: 'none' }}
        />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="mono" style={{ ...setInput, width: 112 }} />
      </div>
      {swatches && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {swatches.map((swatch) => (
            <button
              key={swatch}
              onClick={() => onChange(swatch)}
              title={swatch}
              style={{
                width: 20, height: 20, borderRadius: 6, background: swatch, flex: 'none',
                border: valid && normalizeBrandColor(value) === swatch ? '2px solid var(--ink)' : '1px solid var(--line-2)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A miniature of the public booking page in the chosen theme.
 *
 * Every colour is inline rather than a CSS variable: this is rendered inside the CRM,
 * which has its own tokens and its own light/dark toggle, so reading `var(--panel)` here
 * would show the owner's admin theme instead of the one they are editing.
 */
function BrandPreview({ tokens, name, schedule, serviceLabel, bookLabel }: {
  tokens: ReturnType<typeof brandTokens>;
  name: string;
  schedule: string;
  serviceLabel: string;
  bookLabel: string;
}) {
  const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ background: tokens.bg, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', background: tokens.panel2, border: `1px solid ${tokens.line}`, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800, color: tokens.ink3 }}>
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: tokens.ink, ...ellipsis }}>{name}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: tokens.ink3, ...ellipsis }}>{schedule}</div>
          </div>
        </div>

        <div style={{ background: tokens.panel, border: `1px solid ${tokens.line}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: tokens.ink2 }}>{serviceLabel}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {['10:00', '11:30', '14:00'].map((time, i) => (
              <span
                key={time}
                className="mono"
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 9,
                  background: i === 0 ? tokens.accent : tokens.accentTint,
                  color: i === 0 ? tokens.accentInk : tokens.accentDeep,
                  border: `1px solid ${i === 0 ? tokens.accent : tokens.line}`,
                }}
              >
                {time}
              </span>
            ))}
          </div>
        </div>

        <button style={{ padding: '12px 18px', borderRadius: 12, fontSize: 14.5, fontWeight: 800, background: tokens.accent, color: tokens.accentInk, border: 0 }}>
          {bookLabel}
        </button>
      </div>
    </div>
  );
}

export function Settings() {
  const { t, lang, setLang, role, isTemporaryPassword } = useCRM();
  const { payload, openBusinessEditor, openCredentialsEditor, openPasswordEditor } = useData();
  const [sec, setSec] = useState('profile');
  if (!payload) return null;
  const s = t.set;
  const b = payload.business;

  // `booking` moved to Branding, which is the other half of what a customer sees, and `team`
  // moved to Staff, next to the people it grants access to.
  //
  // It comes BACK here for anyone without a Branding screen. Managers run the shop day to day
  // and are the ones sending customers the link, and moving the section left them with no way
  // to reach it. The condition is the absence of Branding rather than a role name, so it stays
  // correct if the role table changes; specialists fall out anyway, because the worker sends
  // them no links and the panel draws nothing without them.
  const showBookingHere = role !== 'owner' && (payload.bookingLinks?.length ?? 0) > 0;
  const navItems: Array<[string, string]> = [
    ['profile', 'user'],
    ...(showBookingHere ? ([['booking', 'grid']] as Array<[string, string]>) : []),
    ['appearance', 'sun'],
  ];

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
          {sec === 'booking' && showBookingHere && <BookingLinkPanel />}
          {sec === 'profile' && (
            <Panel>
              <SetHead title={s.profile} sub={s.profileSub} />
              {/* The photo moved to Branding and became the logo, which is what it is used
                  for: the booking page header and the CRM sidebar. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginTop: 18 }}>
                {[[s.bizName, b.name], [s.category, b.type], [s.phone, formatPhone(b.phone)], [s.address, b.address], [s.schedule, b.schedule], [s.description, b.description || '—']].map(([label, val], i) => (
                  <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 12, padding: '12px 14px', gridColumn: i >= 3 ? 'span 2' : 'auto' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                {/* Editing the shop and its login are owner capabilities server-side
                    (business:write, credentials:write). Showing them to a manager only earns
                    them a 403 — and the credentials modal would open blank now that
                    crmUsername is redacted for non-owners. */}
                {role === 'owner' && (
                  <>
                    {/* Labelled "Edit", not "Save".
                        The fields above are read-only text and this opens the editor modal, but
                        the button said "Save" — so the screen read as a form that could not be
                        filled in, next to a button that would not do anything. Nobody clicks
                        Save to start editing. */}
                    <button onClick={openBusinessEditor} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 11 }}><Ic name="settings" size={16} stroke={2} />{s.editProfile}</button>
                    <button onClick={openCredentialsEditor} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 11 }}><Ic name="user" size={16} stroke={2} />{s.credentials}</button>
                  </>
                )}
                {/* Every role, always. Changing your own password needs no capability, and a
                    staff member had no way to do it at all until now. */}
                <button onClick={openPasswordEditor} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 11 }}><Ic name="shield" size={16} stroke={2} />{s.myPassword}</button>
              </div>
              {/* `b.crmHasTemporaryPassword` is redacted to false for non-owners, so the
                  session's own flag is what tells a staff member their password is temporary. */}
              {(b.crmHasTemporaryPassword || isTemporaryPassword) && (
                <button onClick={openPasswordEditor} style={{ marginTop: 12, fontSize: 12.5, color: 'var(--amber)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left' }}>
                  <Ic name="bell" size={14} stroke={2} />{isTemporaryPassword ? s.tempPasswordWarn : s.tempPassword}
                </button>
              )}
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
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

type BrandThemeDraft = { bg: string; ink: string; accent: string };

/**
 * The theme as currently stored, per field, as raw strings for the draft to edit.
 * A business with no saved theme falls back to its legacy `brandColor` accent over the
 * default page, which is what its booking page already renders.
 */
function storedTheme(payload: CrmPayload | null): BrandThemeDraft {
  return {
    ...DEFAULT_BRAND_THEME,
    accent: payload?.business.brandColor ?? DEFAULT_BRAND_COLOR,
    ...(payload?.business.brandTheme ?? {}),
  };
}

/**
 * Branding — promoted out of Settings to its own screen.
 *
 * It was a Settings sub-section, three clicks deep, which undersold it: this is the
 * only place a business changes how its booking page looks to customers. It also fixes
 * an unlabelled nav entry — the Settings nav renders `s.nav[k]`, and `brand` was only
 * ever added to `t.set`, so the item showed an icon and no text.
 *
 * Owner-only, matching `business:write` on the server. The `role` check here is
 * cosmetic; the Worker rejects the save regardless.
 */
export function Branding() {
  const { t, role, notify } = useCRM();
  const { payload, reload, uploadBusinessPhoto, deleteBusinessPhoto } = useData();
  // Draft holds raw strings, not validated colours: the owner may be mid-way through
  // typing a hex, and snapping it to a valid value on every keystroke fights them.
  //
  // A business that picked an accent before themes existed has no stored theme, so it
  // opens on that accent over the default page — which is exactly what its booking page
  // renders today, so the preview is not lying about the current state.
  const [themeDraft, setThemeDraft] = useState(() => storedTheme(payload));
  // As its own screen this can mount before the payload lands, where the initialiser
  // above sees nothing and falls back to the defaults. Re-sync from the payload until
  // the owner touches a field, so a slow first load cannot show the wrong brand.
  const [touched, setTouched] = useState(false);
  // Saved on click rather than gathered into the colour form's Save: it is one value out of a
  // closed set, so there is nothing to review before committing it, and pairing it with the
  // colours would mean a contrast failure blocked an unrelated change.
  const [flowSaving, setFlowSaving] = useState(false);
  const stored = JSON.stringify(storedTheme(payload));
  useEffect(() => {
    if (!touched) setThemeDraft(JSON.parse(stored) as BrandThemeDraft);
  }, [stored, touched]);

  const s = t.set;
  if (role !== 'owner') {
    return <div className="fadein" style={{ padding: 28 }}><EmptyHint text={s.ownerOnly} /></div>;
  }
  if (!payload) return null;
  const b = payload.business;


  const onPickFlow = async (flow: BookingFlow) => {
    if (flow === payload.business.bookingFlow) return;
    try {
      setFlowSaving(true);
      await updateBusinessProfile({ bookingFlow: flow });
      notify();
      await reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Error');
    } finally {
      setFlowSaving(false);
    }
  };

  const editTheme = (next: BrandThemeDraft) => { setTouched(true); setThemeDraft(next); };
  const setThemePart = (key: 'bg' | 'ink' | 'accent') => (value: string) => {
    setTouched(true);
    setThemeDraft((draft) => ({ ...draft, [key]: value }));
  };
  // Preview falls back per field, so one half-typed hex does not blank the whole preview.
  const themeSafe = {
    bg: isValidBrandColor(themeDraft.bg) ? themeDraft.bg : DEFAULT_BRAND_THEME.bg,
    ink: isValidBrandColor(themeDraft.ink) ? themeDraft.ink : DEFAULT_BRAND_THEME.ink,
    accent: isValidBrandColor(themeDraft.accent) ? themeDraft.accent : DEFAULT_BRAND_THEME.accent,
  };
  const brandPreview = brandTokens(themeSafe);
  const brandHexInvalid = !isValidBrandColor(themeDraft.bg) || !isValidBrandColor(themeDraft.ink) || !isValidBrandColor(themeDraft.accent);
  const brandContrast = themeTextContrast(themeSafe);
  // The worker rejects with this same function, so a disabled button and a 400 can never
  // disagree about what is saveable.
  const canSaveBrand = normalizeBrandTheme(themeDraft) !== null;
  const onSaveBrand = async () => {
    const theme = normalizeBrandTheme(themeDraft);
    if (!theme) return;
    try {
      // Only the theme is sent: the worker writes brand_color from its accent, so the
      // Telegram bots and any deploy still mid-rollout keep reading the right colour.
      await updateBusinessProfile({ brandTheme: theme });
      // The save is now the truth, so hand control back to the payload.
      setTouched(false);
      notify();
      await reload();
    } catch (e) { notify(e instanceof Error ? e.message : 'Error'); }
  };

  return (
    /* Two columns. The three panels are one subject but not one task: the logo and the
       colours are things you change, the link and the QR are things you fetch and hand to a
       customer. Stacked, Branding was a 760px ribbon down the left of a wide screen with the
       QR pushed under the fold; side by side it fits on one screen.

       Collapses to one column under 1100px — see .crm-brand in crm.css. */
    <div className="fadein crm-brand" style={{ padding: 28, maxWidth: 1180, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
      {/* Left: what you change. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
  {/* The logo, the share link and the colours are one subject: what a customer sees. The
      first two used to live in Settings, two screens from the third. */}
  <Panel>
    <SetHead title={s.logo} sub={s.logoSub} />
    <div style={{ display: 'flex', gap: 18, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ width: 96, height: 96, borderRadius: 20, overflow: 'hidden', flex: 'none', background: brandPreview.accentTint, border: `1px solid ${brandPreview.line}`, display: 'grid', placeItems: 'center' }}>
        {b.photoFileId ? (
          // Cache-busted on generatedAt: the URL is otherwise identical after an upload, so
          // the browser would keep showing the old logo until a hard refresh.
          <img src={`/api/business/photo?v=${encodeURIComponent(payload.generatedAt)}`} alt={b.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          /* No upload: the business's initial over its own accent. A shop with no logo file
             still gets something that looks deliberate rather than an empty grey box. */
          <span style={{ fontSize: 38, fontWeight: 800, color: brandPreview.accentDeep }}>{b.name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 11 }}>{s.logoHint}</div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button onClick={uploadBusinessPhoto} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, padding: '9px 15px', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)' }}>
            <Ic name="arrowUp" size={15} stroke={2.4} />{b.photoFileId ? s.logoReplace : s.logoUpload}
          </button>
          {b.photoFileId && (
            <button onClick={deleteBusinessPhoto} style={{ fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 10, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--rose)' }}>{s.logoRemove}</button>
          )}
        </div>
      </div>
    </div>
  </Panel>

  {/* Hidden when the payload carries no links, which is how a specialist's arrives. */}
  <Panel>
    <SetHead title={s.brand} sub={s.brandSub} />

    {/* Picking one of these and stopping is the expected path. Each one is a
        coordinated background/text/button set that clears AA, so an owner who
        never opens the hex fields cannot produce an unreadable page. */}
    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginTop: 18, marginBottom: 9 }}>{s.brandThemes}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))', gap: 9 }}>
      {BRAND_THEME_PRESETS.map((preset) => {
        const on =
          normalizeBrandColor(themeDraft.bg) === preset.theme.bg &&
          normalizeBrandColor(themeDraft.ink) === preset.theme.ink &&
          normalizeBrandColor(themeDraft.accent) === preset.theme.accent;
        const tokens = brandTokens(preset.theme);
        return (
          <button
            key={preset.id}
            onClick={() => editTheme({ ...preset.theme })}
            style={{
              textAlign: 'left', padding: 11, borderRadius: 12, background: tokens.bg,
              border: on ? '2px solid var(--ink)' : `1px solid var(--line-2)`,
              display: 'flex', flexDirection: 'column', gap: 9,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: tokens.ink }}>
                {s.brandThemeNames[preset.id] ?? preset.id}
              </span>
              {on && <Ic name="check" size={15} stroke={3} style={{ color: tokens.accentDeep }} />}
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ flex: 1, height: 16, borderRadius: 5, background: tokens.panel, border: `1px solid ${tokens.line}` }} />
              <span style={{ width: 30, height: 16, borderRadius: 5, background: tokens.accent }} />
            </div>
          </button>
        );
      })}
    </div>

    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginTop: 20, marginBottom: 10 }}>{s.brandCustom}</div>
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <BrandField label={s.brandBg} value={themeDraft.bg} onChange={setThemePart('bg')} />
      <BrandField label={s.brandInk} value={themeDraft.ink} onChange={setThemePart('ink')} />
      <BrandField label={s.brandAccent} value={themeDraft.accent} onChange={setThemePart('accent')} swatches={BRAND_PRESETS} />
    </div>

    <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
      <button onClick={() => editTheme({ ...DEFAULT_BRAND_THEME })} style={{ ...btnGhost, flex: 'none', padding: '9px 15px' }}>{s.brandReset}</button>
    </div>

    {brandHexInvalid && (
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--rose)', marginTop: 12 }}>{s.brandInvalid}</div>
    )}

    {/* The contrast number is shown, not just a pass/fail, because an owner who
        is 0.2 short needs to know they are close rather than guessing which of
        the two colours to move. Below AA the save button is disabled — the
        worker refuses it anyway, and a button that submits and fails is worse
        than one that explains itself. */}
    {!brandHexInvalid && (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 11,
          background: canSaveBrand ? 'var(--panel-2)' : 'var(--rose-t)',
          border: `1px solid ${canSaveBrand ? 'var(--line)' : 'var(--rose)'}`,
        }}
      >
        <Ic name={canSaveBrand ? 'check' : 'bell'} size={15} stroke={2.2} style={{ color: canSaveBrand ? 'var(--ink-2)' : 'var(--rose)', flex: 'none' }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: canSaveBrand ? 'var(--ink-2)' : 'var(--rose)' }}>
          {s.brandContrast}: {brandContrast.toFixed(1)}:1 · {canSaveBrand ? s.brandContrastOk : s.brandContrastLow}
        </span>
      </div>
    )}

    {/* Live preview of the derived tokens, so the owner sees the panel, border
        and button-text colours that get picked for them rather than discovering
        them on the client-facing page. */}
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 9 }}>{s.brandPreview}</div>
      <BrandPreview
        tokens={brandPreview}
        name={b.name}
        schedule={b.schedule}
        serviceLabel={payload.services.find((sv) => sv.isActive)?.name ?? t.nav.services}
        bookLabel={s.brandBook}
      />
    </div>

    <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
      <button
        onClick={() => void onSaveBrand()}
        disabled={!canSaveBrand}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)',
          color: 'var(--accent-ink)', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 11,
          opacity: canSaveBrand ? 1 : 0.5,
        }}
      >
        <Ic name="check" size={16} stroke={2.4} />{s.save}
      </button>
    </div>
  </Panel>
      </div>

      {/* Right: what you hand out, and how it behaves when they open it. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Panel>
          <SetHead title={s.flow} sub={s.flowSub} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
            {/* Driven by BOOKING_FLOWS rather than a literal list, so a flow added to the
                shared model cannot be missing here — which is exactly how time_first stayed
                unreachable while the booking page had supported it all along. */}
            {BOOKING_FLOWS.map((flow) => {
              const on = payload.business.bookingFlow === flow;
              const label = { service_first: s.flowServiceFirst, staff_first: s.flowStaffFirst, time_first: s.flowTimeFirst, service_only: s.flowServiceOnly }[flow];
              const hint = { service_first: s.flowServiceFirstHint, staff_first: s.flowStaffFirstHint, time_first: s.flowTimeFirstHint, service_only: s.flowServiceOnlyHint }[flow];
              return (
                <button
                  key={flow}
                  onClick={() => void onPickFlow(flow)}
                  disabled={flowSaving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '12px 14px', borderRadius: 12,
                    background: on ? 'var(--accent-tint)' : 'var(--panel-2)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                    opacity: flowSaving ? 0.6 : 1,
                  }}
                >
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
                    border: `2px solid ${on ? 'var(--accent-deep)' : 'var(--line-2)'}`,
                    background: on ? 'var(--accent-deep)' : 'transparent',
                  }}>
                    {on && <Ic name="check" size={11} stroke={3.4} style={{ color: 'var(--accent-tint)' }} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: on ? 'var(--accent-deep)' : 'var(--ink)' }}>{label}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', marginTop: 1 }}>{hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Panel>

        <BookingLinkPanel />

      </div>
    </div>
  );
}
