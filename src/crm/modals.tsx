import { useEffect, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';
import { Avatar, Badge, Field, FooterBtns, InfoTip, Modal, PhoneInput, Segmented, SelectInput, StatusBadge, TextInput } from './ui';
import { avatarColor, fmtPrice, fmtSom } from './data';
import { CUSTOMERS, SERVICES, SERV_NAME, STAFF } from './mock';
import { formatPhone, isValidPhone, toStoragePhone } from '../shared/phone';
import { generateDayIntervals, normalizeTime, parseBusinessHours, timeToMinutes } from '../lib/date';
import type { BookingStatus, CalendarBookingCard, ClientRow, CreateCrmBookingInput, CrmPayload, EmployeeRow, PaymentMethod, ServiceCatalogItem, StaffAccessRow } from '../types';

/* ===================== cosmetic "+ Add" modals (no backend) ===================== */
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
    <Modal title={booking.clientName} sub={booking.staffName} icon="calendar" onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatusBadge status={booking.status} />
        <Badge color="var(--ink-2)" tint="var(--panel-2)">{booking.date} · {booking.time}</Badge>
        <Badge color="var(--ink-2)" tint="var(--panel-2)">{booking.duration} {t.serv.min}</Badge>
      </div>

      {/* Every service, itemised. The subtitle used to carry `serviceName`, which for a
          multi-service booking is the summary string "Haircut +1" — so the person who has to
          perform the second service could not find out what it was anywhere in the CRM. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--line)', borderRadius: 11, overflow: 'hidden' }}>
        {booking.services.map((line, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: 'var(--panel-2)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {line.name}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{line.duration} {t.serv.min}</span>
              {/* A price of 0 means nobody set one, so it prints nothing rather than "0". */}
              <span className="tnum" style={{ fontSize: 13, fontWeight: 800 }}>{fmtPrice(line.price) ?? '—'}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {/* Price can be unset; the two payment figures are real totals and 0 is meaningful. */}
        {[
          [fmtPrice(booking.price) ?? '—', t.serv.colPrice],
          [`${fmtSom(booking.payment.net)} ${f.currency}`, f.incoming],
          [`${fmtSom(Math.max(booking.payment.remaining, 0))} ${f.currency}`, t.an.outstanding],
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--panel-2)', borderRadius: 11, padding: '12px 10px', textAlign: 'center' }}>
            <div className="tnum" style={{ fontSize: 15, fontWeight: 800 }}>{s[0]}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s[1]}
              <InfoTip text={[f.tipPrice, f.tipPaid, f.tipOwed][i]} />
            </div>
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
        {/* A heading and a sentence, not three bare dropdowns.
            "Kirim / Naqd / 0" is a set of category names, and a category name only helps
            somebody who already knows the category. These owners are barbers, not accountants:
            what they need to read is "the customer paid — write it down here". */}
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 2, display: 'flex', alignItems: 'center' }}>
          {f.recordTitle}
          <InfoTip text={f.recordTip} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 10, lineHeight: 1.45 }}>{f.recordSub}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 4 }}>{f.flowLabel}</div>
            <SelectInput value={flow} onChange={(e) => setFlow(e.target.value as 'in' | 'out')}>
              <option value="in">{f.flowIn}</option>
              <option value="out">{f.flowOut}</option>
            </SelectInput>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 4 }}>{f.methodLabel}</div>
            <SelectInput value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(['cash', 'card', 'transfer', 'other'] as const).map((mm) => <option key={mm} value={mm}>{methodLabel[mm]}</option>)}
            </SelectInput>
          </div>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', marginBottom: 4 }}>{f.amountLabel}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* The currency sits INSIDE the field, against the digits being typed. A label above
              the row is read once and then ignored; this is next to the number itself. */}
          <div style={{ position: 'relative', flex: 1 }}>
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" inputMode="decimal" style={{ width: '100%', paddingRight: 52 }} />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)', pointerEvents: 'none' }}>{f.currency}</span>
          </div>
          <button
            onClick={() => { const v = Number(amount); if (Number.isFinite(v) && v > 0) onPay({ amount: v, method, flow }); }}
            style={{ flex: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 800, color: 'var(--accent-ink)', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <Ic name="check" size={16} stroke={2.4} />{f.addPayment}
          </button>
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {booking.payment.history.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{f.noTxns}</div>}
          {booking.payment.history.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <Badge color={p.flow === 'in' ? 'var(--accent-deep)' : 'var(--rose)'} tint={p.flow === 'in' ? 'var(--accent-tint)' : 'var(--rose-t)'}>{p.flow === 'in' ? f.incoming : f.refund}</Badge>
              <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{methodLabel[p.method]}</span>
              <span className="tnum" style={{ marginLeft: 'auto', fontWeight: 800 }}>{fmtSom(p.amount)} {f.currency}</span>
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
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 800, width: 80, textAlign: 'right' }}>{fmtPrice(v.price) ?? ''}</span>
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
            <Ic name="check" size={17} stroke={2.4} />{m.save}
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
export function ServiceEditModal({ initial, staffOptions, categories, onClose, onSave }: { initial: ServiceCatalogItem | null; staffOptions: EmployeeRow[]; categories: string[]; onClose: () => void; onSave: (v: { name: string; category: string; price: number; duration: number; staffIds: number[]; isActive?: boolean }) => void }) {
  const { m } = useCRM();
  const s = m.service;
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [price, setPrice] = useState(initial ? String(Math.round(initial.price)) : '');
  const [duration, setDuration] = useState(initial ? String(initial.duration) : '60');
  const [staffIds, setStaffIds] = useState<number[]>(initial ? [...initial.linkedStaffIds] : []);
  const toggle = (id: number) => setStaffIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const valid = name.trim() && Number(price) >= 0 && Number(duration) > 0;
  return (
    <Modal title={initial ? name || s.title : s.title} sub={s.sub} icon="services" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={s.submit} disabled={!valid} onSubmit={() => onSave({ name: name.trim(), category: category.trim(), price: Number(price), duration: Number(duration), staffIds, isActive: initial?.isActive })} />}>
      <Field label={s.name}><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={s.namePh} autoFocus /></Field>
      {/* Free text with the shop's existing categories offered as shortcuts. A fixed list
          would be wrong the moment somebody who is not a barber signs up; suggesting what
          they have already typed lets the vocabulary converge without being prescribed. */}
      <Field label={s.category}>
        <TextInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder={s.categoryPh} />
        {categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? '' : c)}
                style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 11px', borderRadius: 999, color: category === c ? 'var(--accent-ink)' : 'var(--ink-2)', background: category === c ? 'var(--accent)' : 'var(--panel-2)', border: `1px solid ${category === c ? 'var(--accent)' : 'var(--line-2)'}` }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </Field>
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
    <Modal title={s.profile} sub={s.profileSub} icon="settings" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={m.save} disabled={!valid} onSubmit={() => onSave({ ...f, phone: toStoragePhone(f.phone) ?? f.phone, description: f.description.trim() || null })} />}>
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

/**
 * Take a booking by hand — the phone rings, or a walk-in needs recording.
 *
 * Replaces a cosmetic modal that read from mock.ts and wrote nothing: it listed fake
 * customers and services, and its submit button only showed a toast. This one uses the
 * real catalogue and writes a real row.
 *
 * The time is a free field rather than a picker of free slots, deliberately. An owner
 * squeezing a regular into a busy afternoon is normal, and the server does not enforce
 * availability for staff-made bookings. Slots already taken are shown as a warning so the
 * choice is informed, not blocked.
 */
export function CrmBookingModal({
  payload,
  takenTimes,
  staffId: presetStaffId = null,
  lockStaff = false,
  onDateChange,
  onClose,
  onSave,
}: {
  payload: CrmPayload;
  /** Times already booked on the chosen day for the chosen person, for the clash warning. */
  takenTimes: string[];
  /** Master to open on, when the caller already knows — a master's own card, or their own login. */
  staffId?: number | null;
  /**
   * Show the master as fixed instead of as a dropdown. For a specialist, who can only book
   * onto themselves: the server overwrites the staff id for them regardless, so offering a
   * list of colleagues would be offering a choice that silently does not happen.
   */
  lockStaff?: boolean;
  onDateChange: (date: string, staffId: number) => void;
  onClose: () => void;
  onSave: (v: CreateCrmBookingInput) => void;
}) {
  const { t, m } = useCRM();
  const mb = m.booking;
  const active = payload.services.filter((s) => s.isActive);

  const [serviceId, setServiceId] = useState(active[0]?.id ?? 0);
  const [staffId, setStaffId] = useState(presetStaffId ?? payload.employees[0]?.id ?? 0);
  const [date, setDate] = useState(payload.selectedDate);
  const [time, setTime] = useState('');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  // Which existing client was picked, so the UI can say so. Not sent to the server: bookings
  // carry a name and a phone, and the client rows are DERIVED from those by phone. Picking
  // therefore just fills the two fields correctly, which is exactly what stops a regular
  // turning into a second client because their name was typed differently this time.
  const [picked, setPicked] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Matched on name AND phone: half the time the person on the phone is remembered by their
  // number. Digits only on both sides so a search for "901234567" finds "+998 90 123 45 67".
  const query = clientName.trim().toLowerCase();
  const queryDigits = query.replace(/\D/g, '');
  const matches = query.length < 2 ? [] : payload.clients
    .filter((c) =>
      c.name.toLowerCase().includes(query) ||
      (queryDigits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(queryDigits))
    )
    .slice(0, 6);
  // An exact hit is not a suggestion worth showing — it is what they already typed.
  const showPicker = pickerOpen && !picked && matches.length > 0 &&
    !(matches.length === 1 && matches[0].name.toLowerCase() === query);

  const pickClient = (c: (typeof payload.clients)[number]) => {
    setClientName(c.name);
    if (c.phone) setPhone(c.phone);
    setPicked(c.key);
    setPickerOpen(false);
  };

  const service = active.find((s) => s.id === serviceId) ?? null;
  // Only staff who actually perform this service, unless nobody is linked — in which case
  // the whole team is offered rather than dead-ending the booking.
  const eligible = service && service.linkedStaffIds.length > 0
    ? payload.employees.filter((e) => service.linkedStaffIds.includes(e.id))
    : payload.employees;

  useEffect(() => {
    // Not when the master is fixed: a specialist not linked to the chosen service would
    // otherwise be silently switched to a colleague, and the server would then reject or
    // reassign the booking they thought they were making.
    if (lockStaff) return;
    if (eligible.length > 0 && !eligible.some((e) => e.id === staffId)) setStaffId(eligible[0].id);
  }, [eligible, staffId, lockStaff]);

  useEffect(() => {
    if (date && staffId) onDateChange(date, staffId);
  }, [date, staffId, onDateChange]);

  const normalized = normalizeTime(time);
  const clash = Boolean(normalized && takenTimes.includes(normalized));
  const valid = Boolean(serviceId && staffId && date && normalized && clientName.trim().length >= 2 && (!phone.trim() || isValidPhone(phone)));

  return (
    <Modal
      title={mb.title}
      sub={mb.sub}
      icon="calendar"
      onClose={onClose}
      footer={
        <FooterBtns
          onClose={onClose}
          submitLabel={mb.submit}
          disabled={!valid}
          onSubmit={() =>
            onSave({
              serviceId,
              staffId,
              date,
              time: normalized!,
              clientName: clientName.trim(),
              clientPhone: toStoragePhone(phone) ?? undefined,
              notes: notes.trim() || undefined,
            })
          }
        />
      }
    >
      <Field label={mb.customer}>
        <div style={{ position: 'relative' }}>
          <TextInput
            value={clientName}
            onChange={(e) => { setClientName(e.target.value); setPicked(null); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            placeholder={m.customer.namePh}
            autoFocus
          />
          {/* Marks that this is a known client rather than a new one, so nobody wonders
              whether the visit history is about to attach. */}
          {picked && (
            <span style={{ position: 'absolute', top: '50%', right: 11, transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: 'var(--accent-deep)', background: 'var(--accent-tint)', padding: '3px 8px', borderRadius: 999, pointerEvents: 'none' }}>
              <Ic name="check" size={12} stroke={3} />{payload.clients.find((c) => c.key === picked)?.totalVisits ?? 0} {mb.visits}
            </span>
          )}

          {showPicker && (
            <>
              {/* Click-away closes it. Fixed, so it covers the modal too — otherwise the
                  first click outside the list only dismisses the list and feels swallowed. */}
              <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 31, background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 5, maxHeight: 224, overflowY: 'auto' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 8px 4px' }}>{mb.existing}</div>
                {matches.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => pickClient(c)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px', borderRadius: 9, textAlign: 'left' }}
                  >
                    <Avatar name={c.name} color={avatarColor(c.name)} size={30} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div className="tnum" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)' }}>
                        {c.phone ? formatPhone(c.phone) : mb.newClient}
                      </div>
                    </div>
                    <span className="tnum" style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-3)', flex: 'none' }}>{c.totalVisits} {mb.visits}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </Field>
      <Field label={m.customer.phone}>
        <PhoneInput value={phone} onChange={setPhone} />
      </Field>

      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={mb.service} half>
          <SelectInput value={String(serviceId)} onChange={(e) => setServiceId(Number(e.target.value))}>
            {/* The price and its separator both go when there is no price — a bare "Beard cut ·" is worse than the 0 it replaced. */}
            {active.map((s) => { const price = fmtPrice(s.price); return <option key={s.id} value={s.id}>{price ? `${s.name} · ${price}` : s.name}</option>; })}
          </SelectInput>
        </Field>
        <Field label={mb.staff} half>
          {lockStaff ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontWeight: 700 }}>
              <Ic name="user" size={15} stroke={2.2} style={{ color: 'var(--ink-3)', flex: 'none' }} />
              {payload.employees.find((e) => e.id === staffId)?.name ?? '—'}
            </div>
          ) : (
            <SelectInput value={String(staffId)} onChange={(e) => setStaffId(Number(e.target.value))}>
              {eligible.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </SelectInput>
          )}
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <Field label={mb.date} half>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={mb.time} half>
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      {/* Free times for the chosen person and day. Tapping one fills the field; they are a
          shortcut, not a constraint. */}
      {takenTimes.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>
          {t.cal.booked}: <span className="tnum">{takenTimes.join(', ')}</span>
        </div>
      )}
      {clash && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic name="bell" size={13} stroke={2} />{mb.clash}
        </div>
      )}

      <Field label={mb.note}>
        <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={mb.notePh} />
      </Field>
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
    <Modal title={employee.name} sub={st.schedule} icon="calendar" onClose={onClose} footer={<FooterBtns onClose={onClose} submitLabel={m.save} onSubmit={save} />}>
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
                {copiedTo.includes(wd) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: '-1px' }} aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {labels[wd].slice(0, 3)}
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
