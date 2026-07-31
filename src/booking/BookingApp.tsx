import { useEffect, useMemo, useState } from 'react';
import type {
  CreatePublicBookingInput,
  PublicBusinessPayload,
  PublicService,
  PublicStaff,
} from '../types';
import { formatNational, isValidPhone, nationalDigits, PHONE_NATIONAL_PLACEHOLDER, toStoragePhone } from '../shared/phone';
import { brandTokens } from '../shared/brand';
import { DEFAULT_BOOKING_FLOW, flowShowsStaff, flowStaffFirst } from '../shared/bookingFlow';
import { nextMissingStep, parseSelection, stringifySelection, type BookingEntry } from '../shared/bookingUrl';
import { BOOKING_LANGS, LANG_LABEL, T, type BookingLang, detectLang, errorCopy, rememberLang } from './i18n';
import '../crm/crm.css';
import './booking.css';

/**
 * The public booking page.
 *
 * ## A hub, not a form
 *
 * This used to be one long scroll: service, then specialist, then day, then time, then your
 * details, each revealed as the one above it was answered. That order is an assumption, and it
 * is wrong about half the customers — plenty know they want Aziz, or know they are free
 * Thursday evening, long before they know what the service is called.
 *
 * So the landing screen is a MENU of three entries, and each opens a full screen of its own.
 * Answer them in any order; the menu shows what is chosen so far. `bookingFlow` still decides
 * which entry is listed first and whether the specialist entry exists at all, so the owner's
 * setting is preserved rather than overridden.
 *
 * One screen at a time also fixes the thing that made the old page hard on a phone: five
 * sections stacked meant the time picker sat below the fold, and choosing a slot scrolled the
 * page under your thumb.
 */

/** How far ahead a client may browse. The API independently caps this at 60 days. */
const DAYS_SHOWN = 21;

/**
 * Longest visit a customer may assemble, in minutes.
 *
 * Two hours. Past that it stops being one appointment and starts being a block of somebody's
 * afternoon booked by a stranger who may not turn up — a decision for the shop to take by
 * phone, not something a web form should hand out. The server has its own eight-line cap on
 * the same reasoning.
 */
const MAX_BASKET_MINUTES = 120;

/* ------------------------------------------------------------------ helpers */

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const base = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  const next = new Date(base + days * 86400000);
  return next.toISOString().slice(0, 10);
}

function isoWeekday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * A service price, or null when there is none to show.
 *
 * A price of 0 means the shop has not set one — this is the customer-facing page, and "0 so'm"
 * there reads as a promise that the haircut is free.
 */
function money(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  // The catalogue is priced in whole som; grouping is all the formatting it needs.
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} so'm`;
}

/** Morning / afternoon / evening, so a column of twenty times becomes three short ones. */
function partOfDay(time: string): 'morning' | 'day' | 'evening' {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`bk-chip${on ? ' is-on' : ''}`}>
      {children}
    </button>
  );
}

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

/** Row icons. Inline rather than from the CRM set — this page ships to clients, not owners. */
function RowIcon({ name }: { name: 'staff' | 'date' | 'service' }) {
  const d =
    name === 'staff'
      ? 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87'
      : name === 'date'
        ? 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'
        : 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01';
  return (
    <span className="bk-rowicon">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={`M${seg}`} />)}
      </svg>
    </span>
  );
}

function Chevron() {
  return (
    <svg className="bk-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function Pencil() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/**
 * The running basket: how many, how long, how much, and a way back to change it.
 *
 * Visible from the moment one service is ticked, on every screen — the spec's "keep the
 * running summary visible", and the thing that stops somebody assembling a four-service visit
 * without ever seeing what it costs.
 */
function BasketBar({
  services,
  totalPrice,
  totalDuration,
  onEdit,
  t,
}: {
  services: PublicService[];
  totalPrice: number;
  totalDuration: number;
  onEdit: (() => void) | null;
  t: (typeof T)[BookingLang];
}) {
  return (
    <div className="bk-bar-sum">
      <span className="bk-bar-count">
        {services.length} {t.servicesCount}
        {totalDuration > 0 && <span className="bk-bar-dur"> · {formatDuration(totalDuration, t)}</span>}
      </span>
      <span className="bk-bar-total">{money(totalPrice) ?? ''}</span>
      {onEdit && (
        <button type="button" className="bk-bar-edit" onClick={onEdit} aria-label={t.change}>
          <Pencil />
        </button>
      )}
    </div>
  );
}

/** "45 min", "1 h", "1 h 15 min" — minutes alone stop reading past about ninety. */
function formatDuration(total: number, t: (typeof T)[BookingLang]) {
  if (total < 60) return `${total} ${t.minutes}`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins === 0 ? `${hours} ${t.hours}` : `${hours} ${t.hours} ${mins} ${t.minutes}`;
}

/* --------------------------------------------------------------------- app */

type Screen = 'menu' | 'staff' | 'datetime' | 'service' | 'details';

export default function BookingApp() {
  const [lang, setLangState] = useState<BookingLang>(detectLang);
  const t = T[lang];

  const [biz, setBiz] = useState<PublicBusinessPayload | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Seeded from the URL so a refresh, the back button, or a link forwarded to whoever is
  // actually paying all resume the same booking. See shared/bookingUrl.ts.
  const initial = useMemo(() => parseSelection(typeof window === 'undefined' ? '' : window.location.search), []);

  const [screen, setScreen] = useState<Screen>('menu');
  /** Chosen services, in the order they were ticked. Ids, because the catalogue arrives later. */
  const [serviceIds, setServiceIds] = useState<number[]>(initial.serviceIds);
  const [staffId, setStaffId] = useState<number | null>(initial.staffId);
  const [anyStaff, setAnyStaff] = useState(false);
  const [date, setDate] = useState(initial.date ?? '');
  const [time, setTime] = useState(initial.time ?? '');
  /** Free-text filter on the services screen. */
  const [search, setSearch] = useState('');
  /**
   * Which menu row started this booking. It decides the order of everything after, so the
   * flow runs FORWARD through a path instead of returning to the menu between each answer.
   */
  const [entry, setEntry] = useState<BookingEntry>('service');
  /** First day of the month the calendar is showing, as an ISO date. */
  const [monthAnchor, setMonthAnchor] = useState('');
  /** Category filter on the services screen. "" is "all". */
  const [category, setCategory] = useState('');
  /** Collapsed time groups, by key. Open by default — collapsing is for getting a long
      evening list out of the way, not for hiding the times behind an extra tap. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  /**
   * Every free slot on the chosen day, per staff id.
   *
   * The whole list rather than a preview: the cards show the first few as quick-pick pills,
   * but the "at this time" tab has to answer "is this person free at 12:00", and a five-item
   * preview cannot. Fetched once per screen visit and sliced at render.
   */
  const [nextBy, setNextBy] = useState<Record<number, string[]>>({});
  /** Which tab of the specialist screen is showing, when a time is already chosen. */
  const [staffTab, setStaffTab] = useState<'exact' | 'other'>('exact');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
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
      // Asserted at the boundary rather than on the callback parameter. `json()` is
      // Promise<unknown> under @cloudflare/workers-types, so annotating the parameter is not a
      // narrowing — it is a claim TypeScript rejects, which is what once failed CI.
      .then((r) => (r.ok ? (r.json() as Promise<PublicBusinessPayload>) : Promise.reject(new Error('load'))))
      .then((body) => {
        if (!alive) return;
        setBiz(body);
        setDate(body.today);
        setMonthAnchor(`${body.today.slice(0, 7)}-01`);
        // A one-service shop has nothing to choose, so choose it for them.
        if (body.services.length === 1 && initial.serviceIds.length === 0) setServiceIds([body.services[0]!.id]);
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  // Brand the page from the business's own theme.
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
    if (tokens.isDark) {
      root.style.setProperty('--shadow-sm', '0 1px 2px rgba(0, 0, 0, 0.4)');
      root.style.setProperty('--shadow', '0 10px 26px -14px rgba(0, 0, 0, 0.6)');
      root.style.setProperty('--shadow-lg', '0 24px 50px -22px rgba(0, 0, 0, 0.7)');
    }
    root.style.colorScheme = tokens.isDark ? 'dark' : 'light';
    if (biz) document.title = `${t.book} · ${biz.name}`;
  }, [biz, t.book]);

  /**
   * The chosen services, resolved against the catalogue and kept in the order they were
   * ticked. Derived rather than stored, so a service the shop archives simply falls out of the
   * basket instead of lingering as a stale object nobody can price.
   */
  const services = useMemo(() => {
    if (!biz) return [];
    const byId = new Map(biz.services.map((item) => [item.id, item]));
    return serviceIds.map((id) => byId.get(id)).filter((x): x is PublicService => Boolean(x));
  }, [biz, serviceIds]);

  const totalPrice = services.reduce((sum, item) => sum + item.price, 0);
  const totalDuration = services.reduce((sum, item) => sum + item.duration, 0);

  const staff = useMemo(
    () => (staffId && biz ? biz.staff.find((p) => p.id === staffId) ?? null : null),
    [staffId, biz]
  );

  // Mirror the selection into the address bar. replaceState, not pushState: every tick of a
  // checkbox would otherwise become a history entry, and the back button would walk the
  // customer through their own basket one service at a time instead of leaving the page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = stringifySelection({ staffId, serviceIds, date: date || null, time: time || null });
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  }, [staffId, serviceIds, date, time]);

  const flow = biz?.bookingFlow ?? DEFAULT_BOOKING_FLOW;
  const showStaff = flowShowsStaff(flow);
  const staffFirst = flowStaffFirst(flow);

  /**
   * Only the specialists actually assigned to the chosen service.
   *
   * The assignment is the shop's answer to "who can do this"; guessing past it is worse than
   * not offering the service, which is why getPublicBusiness drops unassigned ones entirely.
   */
  const eligibleStaff = useMemo(() => {
    if (!biz) return [];
    if (services.length === 0) return biz.staff;
    // EVERY chosen service, not any: one visit is one person, so a specialist who cannot do
    // the beard trim cannot take a haircut-plus-beard booking.
    return biz.staff.filter((person) => services.every((item) => item.staffIds.includes(person.id)));
  }, [biz, services]);

  /** With a specialist chosen first, the service list narrows to what that person performs. */
  const offeredServices = useMemo(() => {
    if (!biz) return [];
    const forStaff = staff ? biz.services.filter((item) => item.staffIds.includes(staff.id)) : biz.services;
    const base = forStaff.length > 0 ? forStaff : biz.services;
    const q = search.trim().toLowerCase();
    return q ? base.filter((item) => item.name.toLowerCase().includes(q)) : base;
  }, [biz, staff, search]);

  /**
   * Changing the specialist can invalidate what is already chosen.
   *
   * A service that person does not perform is dropped, and a held time goes with it, because
   * the slot was sized to a basket that no longer exists. Silent rather than a warning: the
   * basket bar and the summary both show what remains, so the correction is visible where the
   * customer is already looking.
   */
  useEffect(() => {
    if (!biz || !staff) return;
    setServiceIds((current) => {
      const kept = current.filter((id) => biz.services.find((x) => x.id === id)?.staffIds.includes(staff.id));
      return kept.length === current.length ? current : kept;
    });
  }, [biz, staff]);

  /**
   * service_only: the customer never sees a specialist, so one is chosen for them — the first
   * eligible. Not the least busy, which would be a scheduling policy invented here; a shop that
   * turned the step off has said it does not care who by.
   */
  useEffect(() => {
    if (showStaff || services.length === 0) return;
    setStaffId((current) => (current && eligibleStaff.some((p) => p.id === current) ? current : eligibleStaff[0]?.id ?? null));
  }, [showStaff, services.length, eligibleStaff]);

  /** "Any specialist" resolves to a real person the moment a time is known. */
  useEffect(() => {
    if (!anyStaff || staffId) return;
    // "Any specialist" is resolved to a real person as soon as one is available, because a
    // booking row needs a staff_id — the customer simply never had to pick.
    if (eligibleStaff.length > 0) setStaffId(eligibleStaff[0]!.id);
  }, [anyStaff, staffId, eligibleStaff]);

  // Slots depend on staff+date+service; refetch whenever any moves, and drop a held time that
  // is no longer offered so the confirm button cannot submit a stale slot.
  useEffect(() => {
    if (!staff || !date || services.length === 0) {
      setSlots(null);
      return;
    }
    let alive = true;
    setSlotsLoading(true);
    // serviceId is sent so the server can exclude slots the service would overrun; it resolves
    // the duration itself rather than trusting a number from here.
    fetch(`/api/public/slots?staffId=${staff.id}&serviceIds=${serviceIds.join(',')}&date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ slots: string[] }>) : Promise.reject(new Error('slots'))))
      .then((body) => {
        if (!alive) return;
        setSlots(body.slots);
        setTime((current) => (current && body.slots.includes(current) ? current : ''));
      })
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setSlotsLoading(false));
    return () => {
      alive = false;
    };
  }, [staff, date, services.length, serviceIds]);

  /**
   * Next free times for every eligible specialist, for the chips on their cards.
   *
   * Fetched only while that screen is open, and only once a service is chosen — the slot API
   * needs a duration to know what fits. One request per specialist is acceptable for a team of
   * a handful; it would not be for a hundred, and this is a barbershop.
   */
  useEffect(() => {
    if (screen !== 'staff' || services.length === 0 || !date) return;
    let alive = true;
    const people = eligibleStaff.slice(0, 12);
    Promise.all(
      people.map((person) =>
        fetch(`/api/public/slots?staffId=${person.id}&serviceIds=${serviceIds.join(',')}&date=${encodeURIComponent(date)}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ slots: string[] }>) : { slots: [] }))
          .then((body) => [person.id, body.slots] as const)
          .catch(() => [person.id, [] as string[]] as const)
      )
    ).then((pairs) => {
      if (!alive) return;
      setNextBy(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [screen, services.length, serviceIds, date, eligibleStaff]);

  function dayLabel(iso: string) {
    if (!biz) return iso;
    if (iso === biz.today) return t.today;
    if (iso === addDaysIso(biz.today, 1)) return t.tomorrow;
    return t.weekdays[isoWeekday(iso)]!;
  }

  /** Bookable window: today through DAYS_SHOWN, which is what the API will accept. */
  const lastDay = biz ? addDaysIso(biz.today, DAYS_SHOWN) : '';
  const canBook = (iso: string) => Boolean(biz) && iso >= biz!.today && iso <= lastDay;

  /** Monday-first grid for the anchored month, padded with the surrounding days. */
  const monthGrid = useMemo(() => {
    if (!monthAnchor) return [] as string[];
    const first = isoWeekday(monthAnchor); // 0 = Sunday
    const lead = (first + 6) % 7; // shift so Monday is column 0
    const start = addDaysIso(monthAnchor, -lead);
    return Array.from({ length: 42 }, (_, i) => addDaysIso(start, i));
  }, [monthAnchor]);

  const canSubmit = Boolean(services.length > 0 && staff && date && time && name.trim().length >= 2 && isValidPhone(phone) && !submitting);

  async function submit() {
    if (services.length === 0 || !staff || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const payload: CreatePublicBookingInput = {
      // The whole basket. The server prices and times it from these ids, never from anything
      // this page calculated — the totals on screen are for the customer, not for the record.
      serviceIds,
      staffId: staff.id,
      date,
      time,
      clientName: name.trim(),
      clientPhone: toStoragePhone(phone) ?? phone,
      notes: [notes.trim(), email.trim() ? `email: ${email.trim()}` : ''].filter(Boolean).join(' · ') || undefined,
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
          const refresh = await fetch(`/api/public/slots?staffId=${staff.id}&serviceIds=${serviceIds.join(',')}&date=${encodeURIComponent(date)}`);
          if (refresh.ok) setSlots(((await refresh.json()) as { slots: string[] }).slots);
          setScreen('datetime');
        }
        return;
      }
      setDone({ serviceName: services.map((x) => x.name).join(' · '), staffName: staff.name });
    } catch {
      setError(t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null);
    setScreen('menu');
    setServiceIds(biz && biz.services.length === 1 ? [biz.services[0]!.id] : []);
    setStaffId(null);
    setAnyStaff(false);
    setTime('');
    setName('');
    setPhone('');
    setEmail('');
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

  const logo = biz.hasPhoto ? (
    <img className="bk-avatar" src="/api/public/photo" alt="" />
  ) : (
    <span className="bk-avatar bk-avatar-fallback">{biz.name.slice(0, 1).toUpperCase()}</span>
  );

  /** Everything answered, so the details screen can be reached. */
  const missing = nextMissingStep(
    { staffId, serviceIds, date: date || null, time: time || null },
    { needsStaff: showStaff, entry }
  );
  const ready = missing === null;
  /** The CTA's destination AND its label come from one place, so they cannot disagree. */
  const ctaStep: Screen = missing === 'staff' ? 'staff' : missing === 'service' ? 'service' : missing === 'datetime' ? 'datetime' : 'details';
  const ctaLabel = missing === 'staff' ? t.chooseStaff : missing === 'service' ? t.chooseService : missing === 'datetime' ? t.chooseDate : t.confirm;
  const staffLabel = anyStaff ? t.anySpecialist : staff?.name ?? t.notChosen;
  const whenLabel = time ? `${dayLabel(date)}, ${time}` : t.notChosen;

  /* ------------------------------------------------------------- confirmation */

  if (done) {
    return (
      <div className="bk-shell">
        <div className="bk-card bk-done">
          <div className="bk-done-mark">✓</div>
          <h2 className="bk-done-title">{t.doneTitle}</h2>
          <p className="bk-done-line">
            {done.serviceName} · {done.staffName}
            <br />
            {date} · {time}
          </p>
          <p className="bk-done-sub">{t.doneSub}</p>
          <button type="button" className="bk-primary" onClick={reset}>
            {t.addAnother}
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------- head */

  const head = (
    <header className={`bk-head${screen === 'menu' ? ' is-menu' : ''}`}>
      <div className="bk-head-row">
        {screen !== 'menu' && (
          <button type="button" className="bk-back" onClick={() => setScreen('menu')} aria-label={t.back}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        {logo}
        <div className="bk-head-text">
          <h1>{biz.name}</h1>
          <p>{biz.address}</p>
        </div>
        {screen === 'menu' && (
          <div className="bk-langs">
            {BOOKING_LANGS.map((code) => (
              <button key={code} type="button" onClick={() => setLang(code)} className={code === lang ? 'is-on' : ''}>
                {LANG_LABEL[code]}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );

  /* -------------------------------------------------------------------- menu */

  if (screen === 'menu') {
    // Order follows the owner's setting; the specialist entry disappears for service_only.
    const rows: Array<{ key: Screen; icon: 'staff' | 'date' | 'service'; label: string; value: string }> = [];
    const staffRow = { key: 'staff' as Screen, icon: 'staff' as const, label: t.chooseStaff, value: staffLabel };
    const serviceRow = { key: 'service' as Screen, icon: 'service' as const, label: t.chooseService, value: services.length === 0 ? t.notChosen : services.length === 1 ? services[0]!.name : `${services.length} · ${money(totalPrice) ?? ''}` };
    if (showStaff && staffFirst) rows.push(staffRow);
    if (!staffFirst) rows.push(serviceRow);
    rows.push({ key: 'datetime', icon: 'date', label: t.chooseDate, value: whenLabel });
    if (showStaff && !staffFirst) rows.push(staffRow);
    if (staffFirst) rows.push(serviceRow);

    return (
      <div className="bk-shell">
        {head}
        <div className="bk-card">
          {biz.services.length === 0 ? (
            <div className="bk-empty">{t.noServices}</div>
          ) : (
            <div className="bk-menu">
              {rows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className="bk-menu-row"
                  onClick={() => {
                    // The row tapped IS the path. Recorded before navigating so the CTA on the
                    // next screen already knows where it is going after this one.
                    setEntry(row.key === 'datetime' ? 'datetime' : row.key === 'staff' ? 'staff' : 'service');
                    setScreen(row.key);
                  }}
                >
                  <RowIcon name={row.icon} />
                  <span className="bk-menu-text">
                    <span className="bk-menu-label">{row.label}</span>
                    <span className={`bk-menu-value${row.value === t.notChosen ? ' is-empty' : ''}`}>{row.value}</span>
                  </span>
                  <Chevron />
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Always points at the next missing piece, and becomes the confirm once all three
            are set. Hidden only while nothing at all is chosen, when it would have nothing
            useful to say. */}
        {(staffId || services.length > 0 || time) && (
          <div className="bk-bar">
            {services.length > 0 && <BasketBar services={services} totalPrice={totalPrice} totalDuration={totalDuration} onEdit={() => setScreen('service')} t={t} />}
            <button type="button" className="bk-primary" onClick={() => setScreen(ctaStep)}>
              {ctaLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------------- services */

  if (screen === 'service') {
    // Distinct categories, in the order the services come back, with uncategorised last so a
    // shop that has only labelled half its list still reads top to bottom.
    const cats = Array.from(new Set(offeredServices.map((x) => x.category).filter(Boolean)));
    const hasLoose = offeredServices.some((x) => !x.category);
    const shown = category ? offeredServices.filter((x) => x.category === category) : offeredServices;
    // Grouped only when there is more than one heading to show; a single group is just a list
    // with a redundant title over it.
    const groupsToRender = category || (cats.length < 2 && !(cats.length === 1 && hasLoose))
      ? [['', shown] as const]
      : [...cats.map((c) => [c, shown.filter((x) => x.category === c)] as const),
         ...(hasLoose ? [['', shown.filter((x) => !x.category)] as const] : [])];

    return (
      <div className="bk-shell">
        {head}
        <h2 className="bk-title">{t.service}</h2>

        <label className="bk-search">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 21l-4.3-4.3" /><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} aria-label={t.searchPh} />
        </label>

        {cats.length > 0 && (
          <div className="bk-cats">
            <button type="button" className={`bk-cat${category === '' ? ' is-on' : ''}`} onClick={() => setCategory('')}>
              {t.allCategories}
            </button>
            {cats.map((c) => (
              <button key={c} type="button" className={`bk-cat${category === c ? ' is-on' : ''}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="bk-card">
          {groupsToRender.map(([heading, items]) =>
            items.length === 0 ? null : (
              <div key={heading || '_'} className="bk-group">
                {heading && <div className="bk-group-title">{heading}</div>}
                <div className="bk-list">
                  {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={serviceIds.includes(item.id)}
                disabled={!serviceIds.includes(item.id) && totalDuration + item.duration > MAX_BASKET_MINUTES}
                onClick={() => {
                  // Toggle, and clear any held time: the slot was sized to the old basket, and
                  // keeping it would let a longer visit sit in a block that no longer fits.
                  setServiceIds((current) =>
                    current.includes(item.id) ? current.filter((x) => x !== item.id) : [...current, item.id]
                  );
                  setTime('');
                }}
                className={`bk-row${serviceIds.includes(item.id) ? ' is-on' : ''}`}
              >
                <span className="bk-row-main">
                  <span className="bk-row-name">{item.name}</span>
                  {item.duration > 0 && (
                    <span className="bk-row-meta">
                      {item.duration} {t.minutes}
                    </span>
                  )}
                  {/* Omitted entirely when unpriced, not shown as a dash — an empty column is
                      quieter than a placeholder standing in for a price. */}
                  {money(item.price) && <span className="bk-row-price">{money(item.price)}</span>}
                </span>
                <span className={`bk-check${serviceIds.includes(item.id) ? ' is-on' : ''}`} />
              </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
        {services.length > 0 && (
          <div className="bk-bar">
            <BasketBar services={services} totalPrice={totalPrice} totalDuration={totalDuration} onEdit={null} t={t} />
            <button type="button" className="bk-primary" onClick={() => setScreen(ctaStep)}>
              {ctaLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- specialists */

  if (screen === 'staff') {
    // Free at the exact time the customer already picked. Only meaningful once a time is held,
    // which is the date-first path; the other two reach this screen with nothing to compare to.
    const freeNow = (id: number) => (nextBy[id] ?? []).includes(time);
    const showTabs = Boolean(time && date);
    // Both tabs list the same people. They differ in what a row MEANS: in the exact-time tab
    // anyone who cannot fit is dimmed and unpickable, in the other tab everyone is pickable and
    // brings their own times. Dimming rather than filtering, so a customer looking for a
    // particular barber sees they exist and are busy rather than concluding they have left.

    return (
      <div className="bk-shell">
        {head}
        <h2 className="bk-title">{t.specialist}</h2>

        {showTabs && (
          <div className="bk-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={staffTab === 'exact'}
              className={`bk-tab${staffTab === 'exact' ? ' is-on' : ''}`}
              onClick={() => setStaffTab('exact')}
            >
              {dayLabel(date)}, {time}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={staffTab === 'other'}
              className={`bk-tab${staffTab === 'other' ? ' is-on' : ''}`}
              onClick={() => setStaffTab('other')}
            >
              {t.otherTime}
            </button>
          </div>
        )}

        <div className="bk-card">
          {(!showTabs || staffTab === 'other') && (
          <button
            type="button"
            className={`bk-person${anyStaff ? ' is-on' : ''}`}
            onClick={() => {
              // Resolved to a real person here, because a booking row needs a staff_id. The
              // customer simply never had to choose one.
              setAnyStaff(true);
              setStaffId(eligibleStaff[0]?.id ?? null);
            }}
          >
            <RowIcon name="staff" />
            <span className="bk-person-main">
              <span className="bk-person-name">{t.anySpecialist}</span>
            </span>
            <span className={`bk-radio${anyStaff ? ' is-on' : ''}`} />
          </button>
          )}

          {eligibleStaff.map((person) => {
            const slots = nextBy[person.id] ?? [];
            const next = slots.slice(0, 5);
            const on = !anyStaff && staff?.id === person.id;
            // Only the exact-time tab can rule somebody out; elsewhere every eligible
            // specialist is a valid choice and brings their own times with them.
            const busy = showTabs && staffTab === 'exact' && !freeNow(person.id);
            return (
              <div key={person.id} className={`bk-person-block${on ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}>
                <button
                  type="button"
                  className="bk-person"
                  disabled={busy}
                  onClick={() => {
                    setAnyStaff(false);
                    setStaffId(person.id);
                  }}
                >
                  {person.hasPhoto ? (
                    <img className="bk-person-photo" src={`/api/public/staff/${person.id}/photo`} alt="" />
                  ) : (
                    <span className="bk-person-photo bk-person-initial">{person.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="bk-person-main">
                    <span className="bk-person-name">{person.name}</span>
                    {person.role && <span className="bk-person-role">{person.role}</span>}
                    {busy && <span className="bk-person-busy">{t.busyAt}</span>}
                  </span>
                  <span className={`bk-radio${on ? ' is-on' : ''}`} />
                </button>

                {/* Next free times, so somebody who mainly cares "when can I be seen" does not
                    have to open each specialist to find out. */}
                {next.length > 0 && (!showTabs || staffTab === 'other') && (
                  <div className="bk-next">
                    <span className="bk-next-label">
                      {t.nearest} {dayLabel(date)}:
                    </span>
                    <div className="bk-next-chips">
                      {next.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          className="bk-next-chip"
                          onClick={() => {
                            // The pill answers two questions at once — who, and when — which
                            // is the whole point of showing it on the card.
                            setAnyStaff(false);
                            setStaffId(person.id);
                            setTime(slot);
                            setScreen(services.length === 0 ? 'service' : 'details');
                          }}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(staff || anyStaff) && (
          <div className="bk-bar">
            {services.length > 0 && <BasketBar services={services} totalPrice={totalPrice} totalDuration={totalDuration} onEdit={() => setScreen('service')} t={t} />}
            <button type="button" className="bk-primary" onClick={() => setScreen(ctaStep)}>
              {ctaLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- date + time */

  if (screen === 'datetime') {
    const groups: Array<['morning' | 'day' | 'evening', string]> = [
      ['morning', t.partMorning],
      ['day', t.partDay],
      ['evening', t.partEvening],
    ];
    const monthIndex = Number(monthAnchor.slice(5, 7)) - 1;

    return (
      <div className="bk-shell">
        {head}
        <div className="bk-card">
          <div className="bk-cal-head">
            {/* The month reads as a control, not a caption — it is the thing you change. */}
            <span className="bk-cal-month">{t.months[monthIndex]}</span>
            <span className="bk-cal-nav">
              <button type="button" onClick={() => setMonthAnchor(`${addDaysIso(monthAnchor, -1).slice(0, 7)}-01`)} aria-label="←">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <button type="button" onClick={() => setMonthAnchor(`${addDaysIso(monthAnchor, 32).slice(0, 7)}-01`)} aria-label="→">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </span>
          </div>
          <div className="bk-cal-grid">
            {/* Monday first, which is how the calendar is read here. */}
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <span key={wd} className="bk-cal-wd">{t.weekdays[wd]}</span>
            ))}
            {monthGrid.map((iso) => {
              const outside = iso.slice(0, 7) !== monthAnchor.slice(0, 7);
              const usable = canBook(iso);
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!usable}
                  onClick={() => setDate(iso)}
                  className={`bk-cal-day${iso === date ? ' is-on' : ''}${outside ? ' is-outside' : ''}`}
                >
                  {Number(iso.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bk-times-wrap">
          {services.length === 0 ? (
            <div className="bk-empty">{t.noSlotsHint}</div>
          ) : slotsLoading ? (
            <div className="bk-empty">{t.loading}</div>
          ) : !slots || slots.length === 0 ? (
            <div className="bk-empty">
              {t.noSlots}
              <span className="bk-empty-hint">{t.noSlotsHint}</span>
            </div>
          ) : (
            groups.map(([key, label]) => {
              const inGroup = slots.filter((slot) => partOfDay(slot) === key);
              if (inGroup.length === 0) return null;
              const shut = collapsed[key] === true;
              return (
                <div key={key} className="bk-part">
                  <button
                    type="button"
                    className="bk-part-head"
                    onClick={() => setCollapsed((c) => ({ ...c, [key]: !shut }))}
                  >
                    <span className="bk-part-label">{label}</span>
                    <svg className={`bk-part-chev${shut ? ' is-shut' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                  </button>
                  {!shut && (
                    <div className="bk-times">
                      {inGroup.map((slot) => (
                        <Chip key={slot} on={time === slot} onClick={() => setTime(slot)}>
                          {slot}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {time && (
          <div className="bk-bar">
            {services.length > 0 && <BasketBar services={services} totalPrice={totalPrice} totalDuration={totalDuration} onEdit={() => setScreen('service')} t={t} />}
            <button type="button" className="bk-primary" onClick={() => setScreen(ctaStep)}>
              {ctaLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ----------------------------------------------------------------- details */

  return (
    <div className="bk-shell">
      {head}
      <h2 className="bk-title">{t.detailsTitle}</h2>

      <div className="bk-card">
        <button type="button" className="bk-sum-row" onClick={() => setScreen('staff')}>
          <span className="bk-sum-main">
            <span className="bk-sum-label">{t.specialist}</span>
            <span className="bk-sum-value">{staffLabel}</span>
          </span>
          <Pencil />
        </button>
        <button type="button" className="bk-sum-row" onClick={() => setScreen('datetime')}>
          <span className="bk-sum-main">
            <span className="bk-sum-label">{t.date}</span>
            <span className="bk-sum-value">{whenLabel}</span>
          </span>
          <Pencil />
        </button>
        <button type="button" className="bk-sum-row" onClick={() => setScreen('service')}>
          <span className="bk-sum-main">
            <span className="bk-sum-label">{t.service}</span>
            <span className="bk-sum-value">{services.length > 0 ? services.map((x) => x.name).join(' · ') : t.notChosen}</span>
          </span>
          <Pencil />
        </button>
        {services.length > 0 && (
          <div className="bk-sum-total">
            <span>
              {t.total}
              {totalDuration > 0 && <span className="bk-sum-dur"> · {formatDuration(totalDuration, t)}</span>}
            </span>
            <span>{money(totalPrice) ?? ''}</span>
          </div>
        )}
      </div>

      <div className="bk-card">
        <div className="bk-section-title">{t.yourDetails}</div>
        <label className="bk-field">
          <span>{t.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} autoComplete="name" />
        </label>
        <label className="bk-field">
          <span>{t.phone}</span>
          <PhoneField value={phone} onChange={setPhone} />
        </label>
        <label className="bk-field">
          <span>{t.email}</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPh} inputMode="email" autoComplete="email" />
        </label>
        <label className="bk-field">
          <span>{t.notes}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPh} />
        </label>
        {error && <div className="bk-error">{error}</div>}
      </div>

      <div className="bk-bar">
        <button type="button" className="bk-primary" disabled={!canSubmit} onClick={() => void submit()}>
          {submitting ? t.submitting : t.confirm}
        </button>
      </div>
    </div>
  );
}
