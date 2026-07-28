import { useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';
import { Avatar, Badge, Field, FooterBtns, Modal, PhoneInput, Segmented, SelectInput, StatusBadge, TextInput } from './ui';
import { fmtSom } from './data';
import { CUSTOMERS, SERVICES, SERV_NAME, STAFF } from './mock';
import { isValidPhone, toStoragePhone } from '../shared/phone';
import { generateDayIntervals, parseBusinessHours, timeToMinutes } from '../lib/date';
import type { BookingStatus, CalendarBookingCard, ClientRow, EmployeeRow, PaymentMethod, ServiceCatalogItem, StaffAccessRow } from '../types';

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
  const [phone, setPhone] = useState('');
  return (
    <Modal title={c.title} sub={c.sub} icon="customers" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={c.submit} onSubmit={onSaved} />}>
      <Field label={c.name}><TextInput placeholder={c.namePh} autoFocus /></Field>
      <Field label={c.phone}><PhoneInput value={phone} onChange={setPhone} /></Field>
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
export type StaffFormValue = { name: string; role: string; phone: string };

export function StaffCreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (v: StaffFormValue) => void }) {
  const { m } = useCRM();
  const s = m.staff;
  const [f, setF] = useState<StaffFormValue>({ name: '', role: '', phone: '' });
  const up = (k: keyof StaffFormValue, v: string) => setF((p) => ({ ...p, [k]: v }));
  // Phone is optional, but a half-typed one is not — it would be stored as nothing.
  const valid = f.name.trim().length >= 2 && (!f.phone.trim() || isValidPhone(f.phone));
  return (
    <Modal title={s.title} sub={s.sub} icon="staff" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={s.submit} disabled={!valid} onSubmit={() => onCreate({ name: f.name.trim(), role: f.role.trim(), phone: toStoragePhone(f.phone) ?? '' })} />}>
      <Field label={s.name}><TextInput value={f.name} onChange={(e) => up('name', e.target.value)} placeholder={s.namePh} autoFocus /></Field>
      <Field label={s.role}><TextInput value={f.role} onChange={(e) => up('role', e.target.value)} placeholder={s.rolePh} /></Field>
      <Field label={s.phone}><PhoneInput value={f.phone} onChange={(v) => up('phone', v)} /></Field>
    </Modal>
  );
}

export function StaffEditModal({
  employee,
  access,
  issued,
  onClose,
  onSave,
  onDelete,
  onAccess,
}: {
  employee: EmployeeRow;
  /** Current CRM access for this person. Undefined for non-owners, who cannot see it. */
  access?: StaffAccessRow;
  /** Credentials just issued, shown once — they cannot be read back. */
  issued?: { username: string; password: string } | null;
  onClose: () => void;
  onSave: (v: StaffFormValue) => void;
  onDelete: () => void;
  /** null revokes. Only passed to owners; access:manage is owner-only server-side too. */
  onAccess?: (level: 'manager' | 'specialist' | null) => void;
}) {
  const { t, m, role } = useCRM();
  const s = m.staff;
  const st = t.set;
  const canManageAccess = role === 'owner' && Boolean(onAccess);
  const currentLevel: 'manager' | 'specialist' | null = access?.enabled ? access.accessRole ?? 'specialist' : null;
  const [f, setF] = useState<StaffFormValue>({ name: employee.name, role: employee.role, phone: employee.phone ?? '' });
  const up = (k: keyof StaffFormValue, v: string) => setF((p) => ({ ...p, [k]: v }));
  const valid = f.name.trim().length >= 2 && (!f.phone.trim() || isValidPhone(f.phone));
  const submit = () => onSave({ name: f.name.trim(), role: f.role.trim(), phone: toStoragePhone(f.phone) ?? '' });
  return (
    <Modal
      title={employee.name}
      sub={t.staff.edit}
      icon="staff"
      onClose={onClose}
      footer={
        <>
          <button onClick={onDelete} style={{ flex: 'none', padding: '11px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, color: 'var(--rose)', background: 'var(--rose-t)' }}>{t.staff.delete}</button>
          <button onClick={submit} disabled={!valid} style={{ flex: 1, padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 800, color: 'var(--accent-ink)', background: valid ? 'var(--accent)' : 'var(--panel-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Ic name="check" size={17} stroke={2.4} />{m.saved}
          </button>
        </>
      }
    >
      <Field label={s.name}><TextInput value={f.name} onChange={(e) => up('name', e.target.value)} placeholder={s.namePh} autoFocus /></Field>
      {/* Job title — free text, shown to clients on the booking page. Distinct from the
          CRM access level below, which is a permission. Labelling both "Role" was the
          confusing part. */}
      <Field label={s.role}><TextInput value={f.role} onChange={(e) => up('role', e.target.value)} placeholder={s.rolePh} /></Field>
      <Field label={s.phone}><PhoneInput value={f.phone} onChange={(v) => up('phone', v)} /></Field>

      {canManageAccess && (
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{s.access}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{s.accessHint}</div>
          </div>

          {/* Changing the level applies on that person's next request, because the worker
              re-reads access_role from the staff row rather than trusting the cookie. */}
          <Segmented
            value={currentLevel ?? 'none'}
            onChange={(v) => onAccess?.(v === 'none' ? null : (v as 'manager' | 'specialist'))}
            options={[
              { v: 'none', l: s.accessNone },
              { v: 'specialist', l: st.roleSpecialist },
              { v: 'manager', l: st.roleManager },
            ]}
          />

          {currentLevel && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
              {currentLevel === 'manager' ? st.roleManagerHint : st.roleSpecialistHint}
            </div>
          )}

          {currentLevel && access?.username && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{access.username}</span>
              <button onClick={() => onAccess?.(currentLevel)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 9, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--ink)' }}>
                {st.resetPass}
              </button>
            </div>
          )}

          {issued && (
            <div style={{ padding: '12px 13px', borderRadius: 11, background: 'var(--accent-tint)', border: '1px solid var(--accent)' }}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{st.loginLabel}</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{issued.username}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{st.newPassLabel}</div>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800 }}>{issued.password}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 700 }}>{st.credsWarn}</div>
            </div>
          )}
        </div>
      )}
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
  const valid = f.name.trim() && f.address.trim() && isValidPhone(f.phone) && f.schedule.trim();
  return (
    <Modal title={s.profile} sub={s.profileSub} icon="settings" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={m.saved} disabled={!valid} onSubmit={() => onSave({ ...f, phone: toStoragePhone(f.phone) ?? f.phone, description: f.description.trim() || null })} />}>
      <Field label={s.bizName}><TextInput value={f.name} onChange={(e) => up('name', e.target.value)} autoFocus /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={s.category} half>
          <SelectInput value={f.type} onChange={(e) => up('type', e.target.value)}>
            {BIZ_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </SelectInput>
        </Field>
        <Field label={s.phone} half><PhoneInput value={f.phone} onChange={(v) => up('phone', v)} /></Field>
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

/**
 * Change your own password. Available to every role, unlike CredentialsModal, which also
 * renames the business login and is owner-only.
 *
 * Staff previously had no way to do this at all, so an owner-issued temporary password —
 * read aloud or sent over chat — stayed valid indefinitely, with its plaintext copy still
 * sitting in the row.
 */
export function PasswordModal({ onClose, onSave }: { onClose: () => void; onSave: (v: { currentPassword: string; newPassword: string }) => void }) {
  const { t } = useCRM();
  const s = t.set;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  // Mirrors MIN_PASSWORD_LENGTH in the worker. The server re-checks; this only spares a
  // round trip and gives the reason inline.
  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const valid = Boolean(current) && next.length >= 8 && next === confirm;

  return (
    <Modal
      title={s.myPassword}
      sub={s.myPasswordSub}
      icon="user"
      onClose={onClose}
      footer={<FooterBtns onClose={onClose} submitLabel={s.changePassword} disabled={!valid} onSubmit={() => onSave({ currentPassword: current, newPassword: next })} />}
    >
      <Field label={s.currentPassword}>
        <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
      </Field>
      <Field label={s.newPassword}>
        <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label={s.confirmPassword}>
        <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
      {(tooShort || mismatch) && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--rose)' }}>
          {tooShort ? s.passwordShort : s.passwordMismatch}
        </div>
      )}
    </Modal>
  );
}

/* ===================== real: slot editor ===================== */
/**
 * Weekly shift editor.
 *
 * Rebuilt because the old one had three problems that made a normal week painful:
 *
 *  1. The grid was generated from the BUSINESS schedule string, so a shop listed as
 *     "09:00 - 19:00" could not roster anyone at 08:00 or 22:00 — those buttons did not
 *     exist. The grid is now the full 24 hours; business hours only seed From/To.
 *  2. Every slot needed its own tap. A 09:00-19:00 day is 20 taps, a six-day week ~120.
 *     The From/To range setter does a whole day in three.
 *  3. Nothing could be copied between days, though most shops work identical hours
 *     Monday to Saturday. "Copy to" does that in one tap per day.
 *
 * Individual chips still toggle, for the exceptions the bulk tools cannot express.
 */
export function SlotEditorModal({
  employee,
  schedule,
  onClose,
  onSave,
}: {
  employee: EmployeeRow;
  /** Business hours text. Used only to preset From/To and to dim unusual hours. */
  schedule: string;
  onClose: () => void;
  onSave: (v: {
    weeklySlots: Array<{ weekday: number; slots: string[] }>;
    weeklyBreaks: Array<{ weekday: number; slots: string[] }>;
    dayOffs: Array<{ date: string; isFullDay: boolean; slots: string[] }>;
  }) => void;
}) {
  const { t, m } = useCRM();
  const st = t.staff;
  const allTimes = generateDayIntervals();
  const hours = parseBusinessHours(schedule);

  const [mode, setMode] = useState<'slots' | 'breaks'>('slots');
  const [weekday, setWeekday] = useState(() => employee.weeklySlots.find((d) => d.slots.length)?.weekday ?? 1);
  const [slots, setSlots] = useState<Record<number, string[]>>(() =>
    Object.fromEntries(employee.weeklySlots.map((d) => [d.weekday, [...d.slots]])),
  );
  const [breaks, setBreaks] = useState<Record<number, string[]>>(() =>
    Object.fromEntries(employee.weeklyBreaks.map((d) => [d.weekday, [...d.slots]])),
  );
  const [from, setFrom] = useState(hours?.start ?? '09:00');
  const [to, setTo] = useState(hours?.end ?? '19:00');
  const [copiedTo, setCopiedTo] = useState<number[]>([]);

  const dayOffs = employee.dayOffs.map((d) => ({ date: d.date, isFullDay: d.isFullDay, slots: [...d.slots] }));
  const labels: string[] = t.cal.weekdaysFull;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const cur = mode === 'slots' ? slots : breaks;
  const setCur = mode === 'slots' ? setSlots : setBreaks;
  const active = cur[weekday] ?? [];
  const rangeInvalid = timeToMinutes(to) <= timeToMinutes(from);

  const writeDay = (wd: number, list: string[]) => setCur((p) => ({ ...p, [wd]: [...new Set(list)].sort() }));
  const toggle = (time: string) =>
    writeDay(weekday, active.includes(time) ? active.filter((x) => x !== time) : [...active, time]);

  /** Half-hours from `from` up to but excluding `to`, so 09:00-19:00 ends at 18:30. */
  const applyRange = () => {
    if (rangeInvalid) return;
    const a = timeToMinutes(from);
    const b = timeToMinutes(to);
    writeDay(
      weekday,
      allTimes.filter((time) => {
        const v = timeToMinutes(time);
        return v >= a && v < b;
      }),
    );
  };

  const copyToDay = (wd: number) => {
    writeDay(wd, [...active]);
    setCopiedTo((p) => (p.includes(wd) ? p : [...p, wd]));
  };
  const copyToAll = () => {
    setCur((p) => {
      const next = { ...p };
      for (const wd of order) next[wd] = [...active].sort();
      return next;
    });
    setCopiedTo(order.filter((wd) => wd !== weekday));
  };

  const save = () => {
    onSave({
      weeklySlots: order.map((wd) => ({ weekday: wd, slots: (slots[wd] ?? []).slice().sort() })),
      weeklyBreaks: order.map((wd) => ({ weekday: wd, slots: (breaks[wd] ?? []).slice().sort() })),
      dayOffs,
    });
  };

  const pill = (on: boolean) => ({
    fontSize: 12.5,
    fontWeight: 700,
    padding: '7px 11px',
    borderRadius: 9,
    color: on ? 'var(--accent-ink)' : 'var(--ink-2)',
    background: on ? 'var(--accent)' : 'var(--panel-2)',
    border: '1px solid var(--line-2)',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <Modal title={employee.name} sub={st.schedule} icon="calendar" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={m.saved} onSubmit={save} />}>
      <Segmented value={mode} onChange={(v) => setMode(v as 'slots' | 'breaks')} options={[{ v: 'slots', l: t.cal.addSlot }, { v: 'breaks', l: t.cal.break }]} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {order.map((wd) => {
          const count = (cur[wd] ?? []).length;
          return (
            <button key={wd} onClick={() => { setWeekday(wd); setCopiedTo([]); }} style={pill(wd === weekday)}>
              {labels[wd].slice(0, 3)}{count ? ' · ' + count : ''}
            </button>
          );
        })}
      </div>

      {/* Quick set. This is what makes a full week bearable. */}
      <div style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{st.quick}</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <Field label={st.from} half>
            <SelectInput value={from} onChange={(e) => setFrom(e.target.value)}>
              {allTimes.map((time) => <option key={time} value={time}>{time}</option>)}
            </SelectInput>
          </Field>
          <Field label={st.to} half>
            <SelectInput value={to} onChange={(e) => setTo(e.target.value)}>
              {/* 24:00 lets a shift close at midnight, which 23:30 cannot express. */}
              {[...allTimes.slice(1), '24:00'].map((time) => <option key={time} value={time}>{time}</option>)}
            </SelectInput>
          </Field>
          <button onClick={applyRange} disabled={rangeInvalid} style={{ ...pill(true), padding: '11px 16px', fontSize: 13.5, fontWeight: 800, opacity: rangeInvalid ? 0.45 : 1 }}>
            {st.apply}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => writeDay(weekday, allTimes)} style={pill(false)}>{st.selectAll}</button>
          <button onClick={() => writeDay(weekday, [])} style={pill(false)}>{st.clearDay}</button>
        </div>
      </div>

      {/* Copy to other days. Most shops work the same hours all week. */}
      {active.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{st.copyTo}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {order.filter((wd) => wd !== weekday).map((wd) => (
              <button key={wd} onClick={() => copyToDay(wd)} style={pill(copiedTo.includes(wd))}>
                {copiedTo.includes(wd) ? '✓ ' : ''}{labels[wd].slice(0, 3)}
              </button>
            ))}
            <button onClick={copyToAll} style={{ ...pill(false), fontWeight: 800 }}>{st.copyAll}</button>
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{labels[weekday]}</span>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: active.length ? 'var(--accent-deep)' : 'var(--ink-3)' }}>
            {active.length ? active.length + ' ' + st.slotCount : mode === 'slots' ? st.dayOffLabel : '—'}
          </span>
        </div>
        {/* Capped height: 48 chips would push the footer off a phone screen. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(66px, 1fr))', gap: 6, maxHeight: 224, overflowY: 'auto', paddingRight: 2 }}>
          {allTimes.map((time) => {
            const on = active.includes(time);
            const outside = hours ? timeToMinutes(time) < hours.startMinutes || timeToMinutes(time) >= hours.endMinutes : false;
            return (
              <button
                key={time}
                onClick={() => toggle(time)}
                className="tnum"
                /* Outside the shop's stated hours stays clickable but dimmed — unusual,
                   not unavailable. Rostering an early shift must remain possible. */
                title={outside ? schedule : undefined}
                style={{ fontSize: 12.5, fontWeight: 700, padding: '9px 0', borderRadius: 9, color: on ? 'var(--accent-ink)' : 'var(--ink-2)', background: on ? 'var(--accent)' : 'var(--panel-2)', border: on ? '1px solid var(--accent)' : '1px solid var(--line-2)', opacity: on || !outside ? 1 : 0.5 }}
              >
                {time}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
