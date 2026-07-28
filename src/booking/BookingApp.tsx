import { useEffect, useMemo, useState } from 'react';
import type {
  CreatePublicBookingInput,
  PublicBusinessPayload,
  PublicService,
  PublicStaff,
} from '../types';
import { formatNational, isValidPhone, nationalDigits, PHONE_NATIONAL_PLACEHOLDER, toStoragePhone } from '../shared/phone';
import { brandTokens } from '../shared/brand';
import { BOOKING_LANGS, LANG_LABEL, T, type BookingLang, detectLang, errorCopy, rememberLang } from './i18n';
import '../crm/crm.css';
import './booking.css';

/** How far ahead a client may browse. The API independently caps this at 60 days. */
const DAYS_SHOWN = 21;

/* ------------------------------------------------------------------ helpers */

function addDaysIso(iso: string, days: number) {
  // Arithmetic in UTC on a date-only string, so a DST shift cannot move the result.
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function isoWeekday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function money(amount: number) {
  // The catalogue is priced in whole som; grouping is all the formatting it needs.
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} so'm`;
}

/* -------------------------------------------------------------- primitives */

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`bk-chip${on ? ' is-on' : ''}`}>
      {children}
    </button>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="bk-section">
      <h2 className="bk-section-title">
        <span className="bk-step">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Same +998 mask as the CRM's PhoneInput — the prefix is a static span, never editable. */
function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="bk-phone">
      <span className="bk-phone-cc">+998</span>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={formatNational(nationalDigits(value))}
        placeholder={PHONE_NATIONAL_PLACEHOLDER}
        onChange={(e) => onChange(formatNational(nationalDigits(e.target.value)))}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- app */

export default function BookingApp() {
  const [lang, setLangState] = useState<BookingLang>(detectLang);
  const t = T[lang];

  const [biz, setBiz] = useState<PublicBusinessPayload | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [service, setService] = useState<PublicService | null>(null);
  const [staff, setStaff] = useState<PublicStaff | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ serviceName: string; staffName: string } | null>(null);

  function setLang(next: BookingLang) {
    setLangState(next);
    rememberLang(next);
  }

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let alive = true;
    fetch('/api/public/business')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((body: PublicBusinessPayload) => {
        if (!alive) return;
        setBiz(body);
        setDate(body.today);
        if (body.services.length === 1) setService(body.services[0]);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (biz) document.title = `${t.book} · ${biz.name}`;
  }, [biz, t.book]);

  // Repaint every token from the business's theme. Set on the root element rather than
  // injected as a <style> block so it overrides crm.css by specificity without a
  // stylesheet race, and so a business that has chosen nothing simply inherits the
  // defaults already in the file.
  //
  // This is the whole set, not just the accent, because a themed page is the point: an
  // accent on an off-white page that the owner did not choose still looks like our
  // product. booking.css is documented light-only — it never sets [data-theme] — and that
  // stays true. A dark theme here is not the CRM's dark mode, it is eleven tokens whose
  // values happen to be dark, all of them derived from the owner's background so the
  // contrast holds without a second stylesheet.
  useEffect(() => {
    if (!biz) return;
    const tokens = brandTokens(biz.brandTheme);
    const root = document.documentElement;
    root.style.setProperty('--bg', tokens.bg);
    root.style.setProperty('--panel', tokens.panel);
    root.style.setProperty('--panel-2', tokens.panel2);
    root.style.setProperty('--ink', tokens.ink);
    root.style.setProperty('--ink-2', tokens.ink2);
    root.style.setProperty('--ink-3', tokens.ink3);
    root.style.setProperty('--line', tokens.line);
    root.style.setProperty('--line-2', tokens.line2);
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--accent-deep', tokens.accentDeep);
    root.style.setProperty('--accent-tint', tokens.accentTint);
    root.style.setProperty('--accent-ink', tokens.accentInk);
    // The light shadows are tuned for dark ink on a pale page and are invisible on a dark
    // one, where depth has to come from a heavier drop instead.
    if (tokens.isDark) {
      root.style.setProperty('--shadow-sm', '0 1px 2px rgba(0, 0, 0, 0.4)');
      root.style.setProperty('--shadow', '0 10px 26px -14px rgba(0, 0, 0, 0.6)');
      root.style.setProperty('--shadow-lg', '0 24px 50px -22px rgba(0, 0, 0, 0.7)');
    }
    // Tells the phone to paint its own chrome — the URL bar and the overscroll gutter —
    // to match. Without it a dark booking page sits in a white frame.
    root.style.colorScheme = tokens.isDark ? 'dark' : 'light';
  }, [biz]);

  // Staff who can actually perform the chosen service. A service with no linked staff
  // falls back to the whole team rather than dead-ending the client.
  const eligibleStaff = useMemo(() => {
    if (!biz) return [];
    if (!service || service.staffIds.length === 0) return biz.staff;
    return biz.staff.filter((person) => service.staffIds.includes(person.id));
  }, [biz, service]);

  const days = useMemo(() => {
    if (!biz) return [];
    return Array.from({ length: DAYS_SHOWN }, (_, i) => addDaysIso(biz.today, i));
  }, [biz]);

  // Picking a service can invalidate the chosen specialist.
  useEffect(() => {
    if (staff && !eligibleStaff.some((person) => person.id === staff.id)) {
      setStaff(null);
      setTime('');
    }
  }, [eligibleStaff, staff]);

  // Slots depend on staff+date; refetch whenever either moves, and drop a held time that
  // is no longer offered so the confirm button cannot submit a stale slot.
  useEffect(() => {
    if (!staff || !date || !service) {
      setSlots(null);
      return;
    }
    let alive = true;
    setSlotsLoading(true);
    // serviceId is sent so the server can exclude slots the service would overrun; it
    // resolves the duration itself rather than trusting a number from here.
    fetch(`/api/public/slots?staffId=${staff.id}&serviceId=${service.id}&date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('slots'))))
      .then((body: { slots: string[] }) => {
        if (!alive) return;
        setSlots(body.slots);
        setTime((current) => (current && body.slots.includes(current) ? current : ''));
      })
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setSlotsLoading(false));
    return () => {
      alive = false;
    };
  }, [staff, date, service]);

  function dayLabel(iso: string) {
    if (!biz) return iso;
    if (iso === biz.today) return t.today;
    if (iso === addDaysIso(biz.today, 1)) return t.tomorrow;
    return t.weekdays[isoWeekday(iso)];
  }

  const canSubmit = Boolean(service && staff && date && time && name.trim().length >= 2 && isValidPhone(phone) && !submitting);

  async function submit() {
    if (!service || !staff || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const payload: CreatePublicBookingInput = {
      serviceId: service.id,
      staffId: staff.id,
      date,
      time,
      clientName: name.trim(),
      clientPhone: toStoragePhone(phone) ?? phone,
      notes: notes.trim() || undefined,
    };
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        setError(errorCopy(t, body.code));
        // A lost race means the slot list is wrong; refetch so they see the truth.
        if (body.code === 'slot_taken') {
          setTime('');
          const refresh = await fetch(`/api/public/slots?staffId=${staff.id}&serviceId=${service.id}&date=${encodeURIComponent(date)}`);
          if (refresh.ok) setSlots(((await refresh.json()) as { slots: string[] }).slots);
        }
        return;
      }
      setDone({ serviceName: service.name, staffName: staff.name });
    } catch {
      setError(t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null);
    setService(biz && biz.services.length === 1 ? biz.services[0] : null);
    setStaff(null);
    setTime('');
    setName('');
    setPhone('');
    setNotes('');
    setError(null);
  }

  if (loadError) {
    return (
      <div className="bk-shell">
        <div className="bk-card bk-empty">{t.errGeneric}</div>
      </div>
    );
  }

  if (!biz) {
    return (
      <div className="bk-shell">
        <div className="bk-card bk-empty">{t.loading}</div>
      </div>
    );
  }

  return (
    <div className="bk-shell">
      <header className="bk-head">
        <div className="bk-head-row">
          {biz.hasPhoto ? (
            <img className="bk-avatar" src="/api/public/photo" alt="" />
          ) : (
            <span className="bk-avatar bk-avatar-fallback">{biz.name.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="bk-head-text">
            <h1>{biz.name}</h1>
            <p>{biz.address}</p>
          </div>
          <div className="bk-langs">
            {BOOKING_LANGS.map((code) => (
              <button key={code} type="button" onClick={() => setLang(code)} className={code === lang ? 'is-on' : ''}>
                {LANG_LABEL[code]}
              </button>
            ))}
          </div>
        </div>
        {biz.schedule && <div className="bk-schedule">{biz.schedule}</div>}
      </header>

      {done ? (
        <div className="bk-card bk-done">
          <span className="bk-done-mark" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2>{t.doneTitle}</h2>
          <p className="bk-done-detail">
            {done.serviceName} · {done.staffName}
            <br />
            {date} · {time}
          </p>
          <p className="bk-done-sub">{t.doneSub}</p>
          <button type="button" className="bk-primary" onClick={reset}>
            {t.addAnother}
          </button>
        </div>
      ) : (
        <div className="bk-card">
          {biz.services.length === 0 ? (
            <div className="bk-empty">{t.noServices}</div>
          ) : (
            <>
              <Section step={1} title={t.service}>
                <div className="bk-list">
                  {biz.services.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setService(item);
                        setTime('');
                      }}
                      className={`bk-row${service?.id === item.id ? ' is-on' : ''}`}
                    >
                      <span className="bk-row-main">
                        <span className="bk-row-name">{item.name}</span>
                        {item.duration > 0 && (
                          <span className="bk-row-meta">
                            {item.duration} {t.minutes}
                          </span>
                        )}
                      </span>
                      <span className="bk-row-price">{money(item.price)}</span>
                    </button>
                  ))}
                </div>
              </Section>

              {service && (
                <Section step={2} title={t.specialist}>
                  <div className="bk-chips">
                    {eligibleStaff.map((person) => (
                      <Chip
                        key={person.id}
                        on={staff?.id === person.id}
                        onClick={() => {
                          setStaff(person);
                          setTime('');
                        }}
                      >
                        {person.name}
                        {person.role && <span className="bk-chip-sub">{person.role}</span>}
                      </Chip>
                    ))}
                  </div>
                </Section>
              )}

              {service && staff && (
                <Section step={3} title={t.date}>
                  <div className="bk-days">
                    {days.map((iso) => (
                      <Chip key={iso} on={date === iso} onClick={() => setDate(iso)}>
                        <span className="bk-day-dow">{dayLabel(iso)}</span>
                        <span className="bk-day-num">{Number(iso.slice(8, 10))}</span>
                      </Chip>
                    ))}
                  </div>
                </Section>
              )}

              {service && staff && date && (
                <Section step={4} title={t.time}>
                  {slotsLoading ? (
                    <div className="bk-empty">{t.loading}</div>
                  ) : slots && slots.length > 0 ? (
                    <div className="bk-chips">
                      {slots.map((slot) => (
                        <Chip key={slot} on={time === slot} onClick={() => setTime(slot)}>
                          {slot}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <div className="bk-empty">
                      <strong>{t.noSlots}</strong>
                      <span>{t.noSlotsHint}</span>
                    </div>
                  )}
                </Section>
              )}

              {service && staff && date && time && (
                <Section step={5} title={t.yourDetails}>
                  <label className="bk-field">
                    <span>{t.name}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} autoComplete="name" />
                  </label>
                  <label className="bk-field">
                    <span>{t.phone}</span>
                    <PhoneField value={phone} onChange={setPhone} />
                  </label>
                  <label className="bk-field">
                    <span>{t.notes}</span>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPh} />
                  </label>

                  {error && <div className="bk-error">{error}</div>}

                  <button type="button" className="bk-primary" disabled={!canSubmit} onClick={() => void submit()}>
                    {submitting ? t.submitting : t.confirm}
                  </button>
                </Section>
              )}
            </>
          )}
        </div>
      )}

      {/* Deliberately not brand-coloured: this is easyQ's mark, not the shop's. */}
      <footer className="bk-foot">
        easy<span>Q</span>
      </footer>
    </div>
  );
}
