import { useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';
import { Avatar, Badge, Field, FooterBtns, Modal, Segmented, SelectInput, StatusBadge, TextInput } from './ui';
import { fmtSom } from './data';
import { CUSTOMERS, SERVICES, SERV_NAME, STAFF } from './mock';
import type { BookingStatus, CalendarBookingCard, ClientRow, EmployeeRow, PaymentMethod, ServiceCatalogItem } from '../types';

/* ===================== cosmetic "+ Add" modals (no backend) ===================== */
function BookingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { lang, m } = useCRM();
  const mb = m.booking;
  const [cust, setCust] = useState(String(CUSTOMERS[0].id));
  const [serv, setServ] = useState(String(SERVICES[0].id));
  const [staff, setStaff] = useState(String(STAFF[0].id));
  const [time, setTime] = useState('15:00');
  return (
    <Modal title={mb.title} sub={mb.sub} icon="calendar" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={mb.submit} onSubmit={onSaved} />}>
      <Field label={mb.customer}>
        <SelectInput value={cust} onChange={(e) => setCust(e.target.value)}>
          {CUSTOMERS.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
        </SelectInput>
      </Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={mb.service} half>
          <SelectInput value={serv} onChange={(e) => setServ(e.target.value)}>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{SERV_NAME[lang][s.key]} · {s.price} UZS</option>)}
          </SelectInput>
        </Field>
        <Field label={mb.staff} half>
          <SelectInput value={staff} onChange={(e) => setStaff(e.target.value)}>
            {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={mb.date} half><TextInput type="date" /></Field>
        <Field label={mb.time} half><TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label={mb.note}><TextInput placeholder={mb.notePh} /></Field>
    </Modal>
  );
}

function CustomerModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { m } = useCRM();
  const c = m.customer;
  const [tier, setTier] = useState('new');
  const [via, setVia] = useState('telegram');
  return (
    <Modal title={c.title} sub={c.sub} icon="customers" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={c.submit} onSubmit={onSaved} />}>
      <Field label={c.name}><TextInput placeholder={c.namePh} autoFocus /></Field>
      <Field label={c.phone}><TextInput type="tel" placeholder="+998 90 000 00 00" /></Field>
      <Field label={c.tier}><Segmented value={tier} onChange={setTier} options={[{ v: 'new', l: m.tiers.new }, { v: 'reg', l: m.tiers.reg }, { v: 'vip', l: m.tiers.vip }]} /></Field>
      <Field label={c.source}><Segmented value={via} onChange={setVia} options={[{ v: 'telegram', l: m.via.telegram }, { v: 'web', l: m.via.web }, { v: 'walkin', l: m.via.walkin }, { v: 'phone', l: m.via.phone }]} /></Field>
    </Modal>
  );
}

function ProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { m } = useCRM();
  const p = m.product;
  const [cat, setCat] = useState('hair');
  return (
    <Modal title={p.title} sub={p.sub} icon="box" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={p.submit} onSubmit={onSaved} />}>
      <Field label={p.name}><TextInput placeholder={p.namePh} autoFocus /></Field>
      <Field label={p.cat}><Segmented value={cat} onChange={setCat} options={[{ v: 'hair', l: p.cats.hair }, { v: 'beard', l: p.cats.beard }, { v: 'tools', l: p.cats.tools }, { v: 'retail', l: p.cats.retail }]} /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={p.stock} half><TextInput type="number" defaultValue="10" /></Field>
        <Field label={p.min} half><TextInput type="number" defaultValue="5" /></Field>
      </div>
      <Field label={p.price}><TextInput type="text" defaultValue="65 000" /></Field>
    </Modal>
  );
}

function RuleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { m } = useCRM();
  const r = m.rule;
  const [trig, setTrig] = useState('before24');
  const [ch, setCh] = useState('Telegram');
  const trigList: Array<[string, string]> = [['before24', r.triggers.before24], ['before2', r.triggers.before2], ['after', r.triggers.after], ['inactive', r.triggers.inactive], ['birthday', r.triggers.birthday]];
  return (
    <Modal title={r.title} sub={r.sub} icon="bell" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={r.submit} onSubmit={onSaved} />}>
      <Field label={r.name}><TextInput placeholder={r.namePh} autoFocus /></Field>
      <Field label={r.trigger}>
        <SelectInput value={trig} onChange={(e) => setTrig(e.target.value)}>
          {trigList.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectInput>
      </Field>
      <Field label={r.channel}><Segmented value={ch} onChange={setCh} options={[{ v: 'Telegram', l: 'Telegram' }, { v: 'SMS', l: 'SMS' }]} /></Field>
    </Modal>
  );
}

export function ModalLayer({ modal, onClose, onSaved }: { modal: { type: string } | null; onClose: () => void; onSaved: () => void }) {
  if (!modal) return null;
  const props = { onClose, onSaved };
  if (modal.type === 'booking') return <BookingModal {...props} />;
  if (modal.type === 'customer') return <CustomerModal {...props} />;
  if (modal.type === 'product') return <ProductModal {...props} />;
  if (modal.type === 'rule') return <RuleModal {...props} />;
  return null;
}

/* ===================== real: booking detail (status + payments) ===================== */
export function BookingDetailModal({ booking, onClose, onStatus, onPay }: { booking: CalendarBookingCard; onClose: () => void; onStatus: (s: BookingStatus) => void; onPay: (p: { amount: number; method: PaymentMethod; flow: 'in' | 'out'; note?: string }) => void }) {
  const { t, m } = useCRM();
  const f = t.fin;
  const [amount, setAmount] = useState(booking.payment.remaining > 0 ? String(Math.round(booking.payment.remaining)) : '');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [flow, setFlow] = useState<'in' | 'out'>('in');
  const methodLabel: Record<string, string> = { cash: f.cash, card: f.card, transfer: f.transfer, other: f.other };
  const statusBtns: Array<[BookingStatus, string, string]> = [
    ['confirmed', t.status.confirmed, 'var(--accent-deep)'],
    ['done', t.status.done, 'var(--blue)'],
    ['pending', t.status.pending, 'var(--amber)'],
    ['cancelled', t.status.cancelled, 'var(--rose)'],
  ];
  return (
    <Modal title={booking.clientName} sub={`${booking.serviceName} · ${booking.staffName}`} icon="calendar" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatusBadge status={booking.status} />
        <Badge color="var(--ink-2)" tint="var(--panel-2)">{booking.date} · {booking.time}</Badge>
        <Badge color="var(--ink-2)" tint="var(--panel-2)">{booking.duration} {t.serv.min}</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[[fmtSom(booking.price), t.serv.colPrice], [fmtSom(booking.payment.net), f.incoming], [fmtSom(Math.max(booking.payment.remaining, 0)), t.an.outstanding]].map((s, i) => (
          <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 11, padding: '12px 10px', textAlign: 'center' }}>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 800 }}>{s[0]}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{s[1]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {statusBtns.map(([st, label, col]) => (
          <button key={st} onClick={() => onStatus(st)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, padding: '11px', borderRadius: 10, color: booking.status === st ? '#fff' : col, background: booking.status === st ? col : `color-mix(in srgb, ${col} 12%, var(--panel))`, border: `1px solid color-mix(in srgb, ${col} 30%, transparent)` }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>{f.txns}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <SelectInput value={flow} onChange={(e) => setFlow(e.target.value as 'in' | 'out')}>
              <option value="in">{f.incoming}</option>
              <option value="out">{f.refund}</option>
            </SelectInput>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <SelectInput value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(['cash', 'card', 'transfer', 'other'] as const).map((mm) => <option key={mm} value={mm}>{methodLabel[mm]}</option>)}
            </SelectInput>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" style={{ flex: 1 }} />
          <button
            onClick={() => { const v = Number(amount); if (Number.isFinite(v) && v > 0) onPay({ amount: v, method, flow }); }}
            style={{ flex: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 800, color: 'var(--accent-ink)', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <Ic name="check" size={16} stroke={2.4} />{m.booking.submit}
          </button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {booking.payment.history.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{f.noTxns}</div>}
          {booking.payment.history.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <Badge color={p.flow === 'in' ? 'var(--accent-deep)' : 'var(--rose)'} tint={p.flow === 'in' ? 'var(--accent-tint)' : 'var(--rose-t)'}>{p.flow === 'in' ? f.incoming : f.refund}</Badge>
              <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{methodLabel[p.method]}</span>
              <span className="tnum" style={{ marginLeft: 'auto', fontWeight: 800 }}>{fmtSom(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ===================== real: client history ===================== */
export function ClientHistoryModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const { t } = useCRM();
  const c = t.cust;
  return (
    <Modal title={client.name} sub={c.history} icon="customers" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[[client.totalVisits, c.detailVisits], [fmtSom(client.spentTotal), c.detailSpent], [client.cancelledVisits, c.detailNoshow]].map((s, i) => (
          <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 11, padding: '12px 10px', textAlign: 'center' }}>
            <div className="tnum" style={{ fontSize: 16, fontWeight: 800 }}>{s[0]}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{s[1]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {client.history.map((v) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{v.serviceName}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{v.date} · {v.time} · {v.staffName}</div>
            </div>
            <StatusBadge status={v.status} />
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 800, width: 80, textAlign: 'right' }}>{fmtSom(v.price)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ===================== real: staff create / edit ===================== */
export function StaffCreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const { m } = useCRM();
  const s = m.staff;
  const [name, setName] = useState('');
  return (
    <Modal title={s.title} sub={s.sub} icon="staff" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={s.submit} disabled={!name.trim()} onSubmit={() => onCreate(name.trim())} />}>
      <Field label={s.name}><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={s.namePh} autoFocus /></Field>
    </Modal>
  );
}

export function StaffEditModal({ employee, onClose, onSave, onDelete }: { employee: EmployeeRow; onClose: () => void; onSave: (name: string) => void; onDelete: () => void }) {
  const { t, m } = useCRM();
  const s = m.staff;
  const [name, setName] = useState(employee.name);
  return (
    <Modal
      title={employee.name}
      sub={t.staff.edit}
      icon="staff"
      onClose={onClose}
      footer={
        <>
          <button onClick={onDelete} style={{ flex: 'none', padding: '11px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, color: 'var(--rose)', background: 'var(--rose-t)' }}>{t.staff.delete}</button>
          <button onClick={() => onSave(name.trim())} disabled={!name.trim()} style={{ flex: 1, padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 800, color: 'var(--accent-ink)', background: name.trim() ? 'var(--accent)' : 'var(--panel-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Ic name="check" size={17} stroke={2.4} />{m.saved}
          </button>
        </>
      }
    >
      <Field label={s.name}><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={s.namePh} autoFocus /></Field>
    </Modal>
  );
}

/* ===================== real: service create / edit ===================== */
export function ServiceEditModal({ initial, staffOptions, onClose, onSave }: { initial: ServiceCatalogItem | null; staffOptions: EmployeeRow[]; onClose: () => void; onSave: (v: { name: string; price: number; duration: number; staffIds: number[]; isActive?: boolean }) => void }) {
  const { m } = useCRM();
  const s = m.service;
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(Math.round(initial.price)) : '');
  const [duration, setDuration] = useState(initial ? String(initial.duration) : '60');
  const [staffIds, setStaffIds] = useState<number[]>(initial ? [...initial.linkedStaffIds] : []);
  const toggle = (id: number) => setStaffIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const valid = name.trim() && Number(price) >= 0 && Number(duration) > 0;
  return (
    <Modal title={initial ? name || s.title : s.title} sub={s.sub} icon="services" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={s.submit} disabled={!valid} onSubmit={() => onSave({ name: name.trim(), price: Number(price), duration: Number(duration), staffIds, isActive: initial?.isActive })} />}>
      <Field label={s.name}><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={s.namePh} autoFocus /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={s.dur} half><TextInput type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        <Field label={s.price} half><TextInput type="text" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="80 000" /></Field>
      </div>
      <Field label={s.staff}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {staffOptions.map((sv) => {
            const on = staffIds.includes(sv.id);
            return (
              <button key={sv.id} type="button" onClick={() => toggle(sv.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, padding: '8px 13px', borderRadius: 999, color: on ? 'var(--accent-ink)' : 'var(--ink-2)', background: on ? 'var(--accent)' : 'var(--panel-2)', border: on ? '1.5px solid var(--accent)' : '1.5px solid var(--line-2)' }}>
                {sv.name}
                {on && <Ic name="check" size={14} stroke={2.6} />}
              </button>
            );
          })}
          {staffOptions.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>—</span>}
        </div>
      </Field>
    </Modal>
  );
}

/* ===================== real: business profile ===================== */
const BIZ_TYPES = [
  { value: 'barbershop', label: 'Barbershop' },
  { value: 'beauty_salon', label: 'Beauty salon' },
  { value: 'carwash', label: 'Car wash' },
  { value: 'spa_salon', label: 'Spa' },
  { value: 'dentistry', label: 'Dental' },
  { value: 'medical_services', label: 'Medical' },
  { value: 'other', label: 'Other' },
];

export function BusinessModal({ initial, onClose, onSave }: { initial: { name: string; type: string; address: string; phone: string; schedule: string; description: string }; onClose: () => void; onSave: (v: { name: string; type: string; address: string; phone: string; schedule: string; description: string | null }) => void }) {
  const { t, m } = useCRM();
  const s = t.set;
  const [f, setF] = useState(initial);
  const up = (k: keyof typeof initial, v: string) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.name.trim() && f.address.trim() && f.phone.trim() && f.schedule.trim();
  return (
    <Modal title={s.profile} sub={s.profileSub} icon="settings" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={m.saved} disabled={!valid} onSubmit={() => onSave({ ...f, description: f.description.trim() || null })} />}>
      <Field label={s.bizName}><TextInput value={f.name} onChange={(e) => up('name', e.target.value)} autoFocus /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={s.category} half>
          <SelectInput value={f.type} onChange={(e) => up('type', e.target.value)}>
            {BIZ_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectInput>
        </Field>
        <Field label={s.phone} half><TextInput value={f.phone} onChange={(e) => up('phone', e.target.value)} /></Field>
      </div>
      <Field label={s.address}><TextInput value={f.address} onChange={(e) => up('address', e.target.value)} placeholder={s.addressPh} /></Field>
      <Field label={s.schedule}><TextInput value={f.schedule} onChange={(e) => up('schedule', e.target.value)} placeholder="09:00-19:00" /></Field>
      <Field label={s.description}><TextInput value={f.description} onChange={(e) => up('description', e.target.value)} /></Field>
    </Modal>
  );
}

/* ===================== real: credentials ===================== */
export function CredentialsModal({ initialUsername, onClose, onSave }: { initialUsername: string; onClose: () => void; onSave: (v: { username: string; currentPassword: string; newPassword?: string }) => void }) {
  const { t, m } = useCRM();
  const s = t.set;
  const [username, setUsername] = useState(initialUsername);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const valid = username.trim() && current && (!next || next === confirm);
  return (
    <Modal title={s.credentials} sub={s.credentialsSub} icon="user" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={s.credentialsSave} disabled={!valid} onSubmit={() => onSave({ username: username.trim(), currentPassword: current, newPassword: next.trim() || undefined })} />}>
      <Field label={s.username}><TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></Field>
      <Field label={s.currentPassword}><TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
      <Field label={s.newPassword}><TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <Field label={s.confirmPassword}><TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>
  );
}

/* ===================== real: slot editor ===================== */
export function SlotEditorModal({ employee, intervals, onClose, onSave }: { employee: EmployeeRow; intervals: string[]; onClose: () => void; onSave: (v: { weeklySlots: Array<{ weekday: number; slots: string[] }>; weeklyBreaks: Array<{ weekday: number; slots: string[] }>; dayOffs: Array<{ date: string; isFullDay: boolean; slots: string[] }> }) => void }) {
  const { t, m } = useCRM();
  const [mode, setMode] = useState<'slots' | 'breaks'>('slots');
  const [weekday, setWeekday] = useState(() => employee.weeklySlots.find((d) => d.slots.length)?.weekday ?? 1);
  const [slots, setSlots] = useState<Record<number, string[]>>(() => Object.fromEntries(employee.weeklySlots.map((d) => [d.weekday, [...d.slots]])));
  const [breaks, setBreaks] = useState<Record<number, string[]>>(() => Object.fromEntries(employee.weeklyBreaks.map((d) => [d.weekday, [...d.slots]])));
  const dayOffs = employee.dayOffs.map((d) => ({ date: d.date, isFullDay: d.isFullDay, slots: [...d.slots] }));
  const labels: string[] = t.cal.weekdaysFull;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const cur = mode === 'slots' ? slots : breaks;
  const setCur = mode === 'slots' ? setSlots : setBreaks;
  const active = cur[weekday] ?? [];
  const toggle = (time: string) => setCur((p) => { const list = p[weekday] ?? []; return { ...p, [weekday]: list.includes(time) ? list.filter((x) => x !== time) : [...list, time].sort() }; });

  const save = () => {
    const weeklySlots = order.map((wd) => ({ weekday: wd, slots: (slots[wd] ?? []).slice().sort() }));
    const weeklyBreaks = order.map((wd) => ({ weekday: wd, slots: (breaks[wd] ?? []).slice().sort() }));
    onSave({ weeklySlots, weeklyBreaks, dayOffs });
  };

  return (
    <Modal title={employee.name} sub={t.staff.schedule} icon="calendar" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={m.saved} onSubmit={save} />}>
      <Segmented value={mode} onChange={(v) => setMode(v as 'slots' | 'breaks')} options={[{ v: 'slots', l: t.cal.addSlot }, { v: 'breaks', l: t.cal.break }]} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {order.map((wd) => {
          const on = wd === weekday;
          const count = (cur[wd] ?? []).length;
          return (
            <button key={wd} onClick={() => setWeekday(wd)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 11px', borderRadius: 9, color: on ? 'var(--accent-ink)' : 'var(--ink-2)', background: on ? 'var(--accent)' : 'var(--panel-2)', border: '1px solid var(--line-2)' }}>
              {labels[wd].slice(0, 3)}{count ? ` · ${count}` : ''}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 7 }}>
        {intervals.map((time) => {
          const on = active.includes(time);
          return (
            <button key={time} onClick={() => toggle(time)} className="tnum" style={{ fontSize: 12.5, fontWeight: 700, padding: '9px 0', borderRadius: 9, color: on ? 'var(--accent-ink)' : 'var(--ink-2)', background: on ? 'var(--accent)' : 'var(--panel-2)', border: on ? '1px solid var(--accent)' : '1px solid var(--line-2)' }}>
              {time}
            </button>
          );
        })}
        {intervals.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>—</span>}
      </div>
    </Modal>
  );
}
