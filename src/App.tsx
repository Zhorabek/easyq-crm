import { type FC, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  changeOwnPassword,
  createCrmBooking,
  createBookingPayment,
  createEmployee,
  createService,
  deleteBusinessPhoto as apiDeleteBusinessPhoto,
  uploadStaffPhoto as apiUploadStaffPhoto,
  deleteStaffPhoto as apiDeleteStaffPhoto,
  uploadServicePhoto as apiUploadServicePhoto,
  deleteServicePhoto as apiDeleteServicePhoto,
  deleteEmployee,
  grantStaffAccess,
  revokeStaffAccess,
  updateStaffAccessRole,
  getAuthSession,
  getCrmPayload,
  login as apiLogin,
  logout as apiLogout,
  patchBookingStatus,
  saveEmployeeSlots,
  updateBusinessProfile,
  updateCrmCredentials,
  updateEmployee,
  updateService,
  uploadBusinessPhoto as apiUploadBusinessPhoto,
} from './lib/api';
import { isoToday } from './lib/date';
import { IMAGE_ACCEPT_ATTR, checkImageFile, downscaleImage } from './shared/imageFile';
import type {
  AuthSession,
  BookingStatus,
  CalendarBookingCard,
  ClientRow,
  CrmPayload,
  EmployeeRow,
  PaymentMethod,
  ServiceCatalogItem,
} from './types';
import './crm/crm.css';
import { CRM_LANGS, CRM_M, CRM_T, CRMCtx, useCRM, type CRMContextValue, type Lang, type Role } from './crm/i18n';
import { DataCtx, type DataValue } from './crm/data';
import { OfflineArt } from './crm/OfflineArt';

import { Ic } from './crm/icons';
import { CRMLogo, Toast } from './crm/ui';
import { SubscriptionBanner, SubscriptionExpired } from './crm/Subscription';
import { InstallPrompt } from './crm/InstallPrompt';
import { Tour } from './crm/Tour';
import { Help } from './crm/Help';
import { Sidebar, Topbar } from './crm/shell';
import { useBrandAccent } from './crm/brand-shell';
import { Analytics, Branding, Calendar, Customers, Dashboard, Finance, Reviews, Services, Settings, Staff } from './crm/screens-real';
import {
  BookingDetailModal,
  BusinessModal,
  ClientHistoryModal,
  CredentialsModal,
  CrmBookingModal,
  PasswordModal,
  ModalLayer,
  ServiceEditModal,
  SlotEditorModal,
  StaffCreateModal,
  StaffEditModal,
} from './crm/modals';

/**
 * What the CRM shows with no network.
 *
 * The illustration is capped at 340px and sits above the text rather than beside it. It is
 * reassurance, not information — the point of this screen is the one sentence saying the page
 * will come back on its own, and artwork that outgrows that sentence turns an explanation into
 * a poster.
 *
 * The `.eq-art` class is the whole reason the SVG was inlined: every green in it is
 * `currentColor`, and that class sets the SHOP's brand colour — plus the entrance and float it
 * shares with the install dialog's artwork.
 *
 * The retry button stays even though the `online` event reloads automatically. A browser that
 * has not noticed the network is back leaves somebody with a screen and nothing to press, and
 * "wait" is not an instruction anybody follows twice.
 */
function OfflineState({ hasPayload, onRetry }: { hasPayload: boolean; onRetry: () => void }) {
  const { t } = useCRM();
  const o = t.offline;
  return (
    <div className="fadein" style={{ padding: '32px 28px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      {/* `.eq-art` carries both the brand colour and the shared entrance/float — see crm.css. */}
      <div className="eq-art" style={{ width: '100%', maxWidth: 340 }}>
        <OfflineArt />
      </div>
      <h2 style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{o.title}</h2>
      <p style={{ margin: '10px 0 0', maxWidth: 420, fontSize: 14, fontWeight: 500, lineHeight: 1.55, color: 'var(--ink-2)' }}>{o.body}</p>
      {/* Only when there is something on screen behind this. Warning that cached data may be
          stale is meaningless on a session that never loaded any. */}
      {hasPayload && (
        <p style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)' }}>{o.stale}</p>
      )}
      <button
        onClick={onRetry}
        style={{ marginTop: 22, minHeight: 44, padding: '0 22px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
      >
        {o.retry}
      </button>
    </div>
  );
}

// The real, authenticated CRM only exposes screens with live backend data, so a new
// business starts from an authentic empty setup (no demo/mock screens). The demo-only
// screens (Inventory, Loyalty, Payroll, Marketing, Automations) live in the landing embed
// (Embed.tsx) instead.
//
// Reviews graduated out of that list on 2026-08-10: the client bot had been collecting
// ratings and review text for months and nothing could publish a word of it, so the screen
// stopped being a demo and became the only place that queue can be worked.
const SCREEN_COMPONENTS: Record<string, FC> = {
  dashboard: Dashboard,
  calendar: Calendar,
  customers: Customers,
  staff: Staff,
  services: Services,
  finance: Finance,
  analytics: Analytics,
  branding: Branding,
  reviews: Reviews,
  settings: Settings,
  help: Help,
};

const REAL_SCREENS = ['dashboard', 'calendar', 'customers', 'staff', 'services', 'finance', 'analytics', 'branding', 'reviews', 'settings', 'help'];

// Which screens each role sees. This MIRRORS server/permissions.ts to keep the nav tidy —
// it is NOT the enforcement. Hiding a button stops nobody; the worker rejects the call.
const ROLE_SCREENS: Record<Role, string[] | null> = {
  owner: null,
  // No branding: it needs business:write, which only an owner has.
  manager: ['dashboard', 'calendar', 'customers', 'staff', 'services', 'finance', 'analytics', 'reviews', 'settings', 'help'],
  // Customers is theirs now: the payload used to send them an empty book, and now sends the
  // clients they have personally served (see clientsScopedToStaff in worker.ts). Still no
  // staff screen — that is the whole team, including colleagues' numbers.
  specialist: ['dashboard', 'calendar', 'customers', 'settings', 'help'],
};

const LOGIN_LABEL: Record<Lang, string> = { uz: 'Kirish', ru: 'Войти', en: 'Sign in' };

function lsGet(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Are we already on this business's own subdomain? Compared against the CURRENT apex so
 * this keeps working on a preview domain or localhost, rather than hardcoding easyq.uz.
 */
function isOwnTenantHost(slug: string) {
  try {
    return window.location.hostname.toLowerCase().startsWith(`${slug.toLowerCase()}.`);
  } catch {
    return true; // no window: assume we are where we should be and skip the redirect
  }
}

/** Apex of the current host — `crm.easyq.uz` -> `easyq.uz`. */
function apexHost() {
  const parts = window.location.hostname.split('.');
  return parts.length > 2 ? parts.slice(1).join('.') : window.location.hostname;
}

/**
 * POST the credentials to `<slug>.<apex>/api/auth/session-login` so that host sets its own
 * cookie. A hidden form rather than fetch(): the response is a 303 the browser must FOLLOW
 * as a navigation, and fetch would follow it invisibly and leave us on the old host.
 */
function submitToTenantHost(slug: string, username: string, password: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `https://${slug}.${apexHost()}/api/auth/session-login`;
  for (const [name, value] of [['username', username], ['password', password]]) {
    const field = document.createElement('input');
    field.type = 'hidden';
    field.name = name;
    field.value = value;
    form.appendChild(field);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function App() {
  // ---- auth ----
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // ---- ui prefs ----
  const [lang, setLangState] = useState<Lang>(() => lsGet('easyq_crm_lang', 'uz') as Lang);
  const [active, setActiveState] = useState<string>(() => lsGet('easyq_crm_screen', 'dashboard'));
  const [branch, setBranchState] = useState<number>(() => parseInt(lsGet('easyq_crm_branch', '-1'), 10));
  const [navOpen, setNavOpen] = useState(false);

  // ---- data ----
  const [payload, setPayload] = useState<CrmPayload | null>(null);
  const [selectedDate, setSelectedDateState] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether the browser believes it has a network at all.
   *
   * `navigator.onLine` is only trustworthy in ONE direction, which is exactly the direction
   * needed here: false means there is definitely no network, true means only that an interface
   * is up — a captive wifi portal reports true while nothing can reach us. So this drives the
   * offline SCREEN, and the existing `error` branch still catches the case where we are
   * nominally online and the request fails anyway. Neither replaces the other.
   */
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      // Fetch immediately rather than waiting for the next poll. Coming back from a dead zone
      // and being shown a stale calendar for another interval is the moment this screen exists
      // to avoid, and it is also what the copy promises: the page refreshes itself.
      void reload();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [dayCache, setDayCache] = useState<Record<string, CrmPayload>>({});
  const inFlight = useRef<Set<string>>(new Set());

  // ---- overlays ----
  const [modal, setModal] = useState<{ type: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBookingCard | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [staffEditor, setStaffEditor] = useState<EmployeeRow | null>(null);
  const [slotEditor, setSlotEditor] = useState<EmployeeRow | null>(null);
  const [serviceEditor, setServiceEditor] = useState<{ initial: ServiceCatalogItem | null } | null>(null);
  const [businessEditor, setBusinessEditor] = useState(false);
  const [credentialsEditor, setCredentialsEditor] = useState(false);
  const [passwordEditor, setPasswordEditor] = useState(false);
  const [bookingCreator, setBookingCreator] = useState<{ staffId: number | null } | null>(null);
  // Times already taken for the staff and day chosen inside the modal, so it can warn
  // about a clash. Fetched per selection rather than read off `payload`, which only
  // holds the currently selected date.
  const [takenTimes, setTakenTimes] = useState<string[]>([]);
  const [tourOpen, setTourOpen] = useState(false);
  const tourAutoShown = useRef(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // Which upload the open file dialog belongs to. One <input type="file"> is reused for the
  // logo and every specialist, because a dialog is modal — only one can be open — and a ref
  // per staff member would be an input per row for a control used once in a while.
  const photoTarget = useRef<
    { kind: 'logo' } | { kind: 'staff'; staffId: number } | { kind: 'service'; serviceId: number }
  >({ kind: 'logo' });

  const t = CRM_T[lang] || CRM_T.uz;

  // The business's accent, on the CRM itself and not only the booking page. Accent only —
  // see brand-shell.ts for why the CRM keeps its own surfaces.
  useBrandAccent(payload?.business.brandTheme?.accent ?? payload?.business.brandColor);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { void bootstrap(); }, []);
  useEffect(() => {
    if (!session) { setPayload(null); setLoading(false); return; }
    void load(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, session?.businessId]);
  useEffect(() => {
    if (!toast) return;
    const tm = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(tm);
  }, [toast]);
  useEffect(() => {
    if (!navOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, [navOpen]);
  // First-run guided tour: auto-open once the CRM has loaded, unless already seen.
  //
  // Keyed per BUSINESS. The flag used to be one global 'easyq_crm_tour_done', so the second
  // owner to log in on a shared browser — a demo laptop, a shop's front desk, our own machine
  // during a pitch — silently never got the tour, because somebody else had finished it.
  const tourKey = `easyq_crm_tour_done_${session?.businessId ?? 'anon'}`;
  useEffect(() => {
    if (!payload || tourAutoShown.current) return;
    tourAutoShown.current = true;
    let seen = false;
    try { seen = localStorage.getItem(tourKey) === '1'; } catch {}
    if (!seen) setTourOpen(true);
  }, [payload, tourKey]);

  function setLang(c: Lang) { setLangState(c); try { localStorage.setItem('easyq_crm_lang', c); } catch {} }
  function setActive(s: string) { setActiveState(s); try { localStorage.setItem('easyq_crm_screen', s); } catch {} setNavOpen(false); }
  function setBranch(b: number) { setBranchState(b); try { localStorage.setItem('easyq_crm_branch', String(b)); } catch {} }
  function setSelectedDate(d: string) { setSelectedDateState(d); }
  const notify = (msg?: string) => setToast(msg || CRM_T[lang].set.saved);

  async function bootstrap() {
    try {
      const s = await getAuthSession();
      setSession(s);
      setLoginForm((c) => ({ ...c, username: s.username, password: '' }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setSession(null); setLoginError(null); }
      else setError(e instanceof Error ? e.message : 'Auth error');
    } finally {
      setAuthChecking(false);
    }
  }

  async function load(date: string) {
    try {
      setLoading(true);
      setError(null);
      const res = await getCrmPayload(date);
      setPayload(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setSession(null); setPayload(null); return; }
      setError(e instanceof Error ? e.message : 'Failed to load CRM');
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    setDayCache({});
    inFlight.current.clear();
    await load(selectedDate);
  }

  function ensureDays(dates: string[]) {
    for (const date of dates) {
      if (date === selectedDate || dayCache[date] || inFlight.current.has(date)) continue;
      inFlight.current.add(date);
      getCrmPayload(date)
        .then((p) => setDayCache((c) => ({ ...c, [date]: p })))
        .catch(() => {})
        .finally(() => inFlight.current.delete(date));
    }
  }

  async function handleLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const username = loginForm.username.trim();
    const password = loginForm.password;
    if (!username || !password) { setLoginError('—'); return; }
    try {
      setAuthSubmitting(true);
      setLoginError(null);
      const res = await apiLogin({ username, password });

      // Land them on their own subdomain when they signed in on the central host.
      //
      // A plain redirect would arrive logged OUT: the session cookie carries no `Domain=`,
      // so it exists only on the host that set it (see buildCookie in server/auth.ts).
      // Re-posting the credentials as a form to the tenant host makes THAT host mint its
      // own cookie and 303 to `/` — which is exactly what sessionLogin already does for the
      // signup flow. Cross-origin form posts are not CORS-blocked, so no extra plumbing.
      if (res.session.slug && !isOwnTenantHost(res.session.slug)) {
        submitToTenantHost(res.session.slug, username, password);
        return; // the browser is navigating away; do not touch state
      }

      setSession(res.session);
      setLoginForm({ username: res.session.username, password: '' });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try { await apiLogout(); } finally {
      setSession(null);
      setPayload(null);
      setNavOpen(false);
    }
  }

  // ---- mutations ----
  async function changeStatus(status: BookingStatus) {
    if (!selectedBooking) return;
    await patchBookingStatus(selectedBooking.id, status);
    setSelectedBooking(null);
    notify();
    await reload();
  }
  async function addPayment(p: { amount: number; method: PaymentMethod; flow: 'in' | 'out'; note?: string }) {
    if (!selectedBooking) return;
    await createBookingPayment(selectedBooking.id, p);
    setSelectedBooking(null);
    notify();
    await reload();
  }
  async function doCreateStaff(v: { name: string; role: string; phone: string }) {
    await createEmployee({ name: v.name, role: v.role, phone: v.phone });
    setStaffCreateOpen(false);
    notify();
    await reload();
  }
  async function doSaveStaff(v: { name: string; role: string; phone: string }) {
    if (!staffEditor) return;
    await updateEmployee(staffEditor.id, { name: v.name, role: v.role, phone: v.phone });
    setStaffEditor(null);
    notify();
    await reload();
  }
  // Access changes live here rather than in the modal so the issued credentials survive
  // the reload() that follows — the modal remounts, this state does not.
  const [issuedCreds, setIssuedCreds] = useState<{ staffId: number; username: string; password: string } | null>(null);
  async function doStaffAccess(staffId: number, level: 'manager' | 'specialist' | null) {
    try {
      if (level === null) {
        await revokeStaffAccess(staffId);
        setIssuedCreds(null);
        notify();
      } else {
        const existing = payload?.staffAccess.find((a) => a.staffId === staffId);
        // Already enabled at a different level means a role change, which must NOT reissue
        // the password — only an explicit grant or reset does that.
        if (existing?.enabled && existing.accessRole !== level) {
          await updateStaffAccessRole(staffId, level);
          notify();
        } else {
          const res = await grantStaffAccess(staffId, level);
          setIssuedCreds({ staffId, username: res.username, password: res.password });
        }
      }
      await reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error');
    }
  }

  async function doDeleteStaff() {
    if (!staffEditor) return;
    await deleteEmployee(staffEditor.id);
    setStaffEditor(null);
    notify();
    await reload();
  }
  async function doSaveService(v: { name: string; price: number; duration: number; staffIds: number[]; isActive?: boolean }) {
    if (serviceEditor?.initial) await updateService(serviceEditor.initial.id, v);
    else await createService({ name: v.name, price: v.price, duration: v.duration, staffIds: v.staffIds });
    setServiceEditor(null);
    notify();
    await reload();
  }
  async function doToggleService(s: ServiceCatalogItem) {
    await updateService(s.id, { isActive: !s.isActive });
    notify();
    await reload();
  }
  async function doSaveSlots(v: { weeklySlots: Array<{ weekday: number; slots: string[] }>; weeklyBreaks: Array<{ weekday: number; slots: string[] }>; dayOffs: Array<{ date: string; isFullDay: boolean; slots: string[] }> }) {
    if (!slotEditor) return;
    await saveEmployeeSlots(slotEditor.id, v);
    setSlotEditor(null);
    notify();
    await reload();
  }
  async function doSaveBusiness(v: { name: string; type: string; address: string; phone: string; schedule: string; description: string | null }) {
    await updateBusinessProfile(v);
    setBusinessEditor(false);
    notify();
    await reload();
  }
  async function doSaveCredentials(v: { username: string; currentPassword: string; newPassword?: string }) {
    try {
      const res = await updateCrmCredentials(v);
      setSession(res.session);
      setCredentialsEditor(false);
      notify();
      await reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error');
    }
  }
  async function loadTakenTimes(date: string, staffId: number) {
    try {
      const day = date === selectedDate ? payload : dayCache[date] ?? (await getCrmPayload(date));
      setTakenTimes(
        (day?.calendar.bookings ?? [])
          .filter((b) => b.staffId === staffId && b.status !== 'cancelled')
          .map((b) => b.time)
          .sort(),
      );
    } catch {
      // A failed lookup only costs the clash warning; the booking itself still works.
      setTakenTimes([]);
    }
  }

  async function doCreateBooking(v: Parameters<typeof createCrmBooking>[0]) {
    try {
      await createCrmBooking(v);
      setBookingCreator(null);
      notify();
      await reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error');
    }
  }

  async function doChangePassword(v: { currentPassword: string; newPassword: string }) {
    try {
      const res = await changeOwnPassword(v);
      // The response carries the refreshed session so the temporary-password banner clears
      // without a reload; the cookie is unaffected, so the user stays signed in.
      if (res.session) setSession(res.session);
      setPasswordEditor(false);
      notify(CRM_T[lang].set.passwordChanged);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Error');
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Checked here on the file's leading bytes so a wrong pick is refused instantly instead of
    // after uploading 4 MB to be rejected. Courtesy only: `accept` on the input is a dialog
    // filter and this runs in a browser, so the Worker repeats every check on bytes it read
    // itself. See shared/imageFile.ts.
    const check = await checkImageFile(file);
    if (!check.ok) { notify(t.set[`logoErr_${check.reason}`] ?? t.set.logoErr_not_an_image); return; }
    // Shrunk and re-encoded before it leaves the browser: the stored row is small, and only
    // decoded pixels survive the round trip, so nothing hidden in the original file is stored.
    // A file the browser cannot decode is not an image it could display either.
    const shrunk = await downscaleImage(file);
    if (!shrunk) { notify(t.set.logoErr_not_an_image); return; }
    const target = photoTarget.current;
    try {
      if (target.kind === 'staff') await apiUploadStaffPhoto(target.staffId, shrunk);
      else if (target.kind === 'service') await apiUploadServicePhoto(target.serviceId, shrunk);
      else await apiUploadBusinessPhoto(shrunk);
      // Reload FIRST, then confirm. The payload carries the new photoVersion, so by the time
      // the toast appears the picture on screen is already the one just uploaded — announcing
      // success while the old image is still showing is how it looked broken.
      await reload();
      notify(t.set.photoUploaded);
    } catch (err) { notify(err instanceof Error ? err.message : 'Error'); }
  }

  async function doDeleteServicePhoto(serviceId: number) {
    try { await apiDeleteServicePhoto(serviceId); await reload(); notify(t.set.photoDeleted); } catch (err) { notify(err instanceof Error ? err.message : 'Error'); }
  }
  async function doDeleteStaffPhoto(staffId: number) {
    try { await apiDeleteStaffPhoto(staffId); await reload(); notify(t.set.photoDeleted); } catch (err) { notify(err instanceof Error ? err.message : 'Error'); }
  }
  async function doDeletePhoto() {
    try { await apiDeleteBusinessPhoto(); await reload(); notify(t.set.photoDeleted); } catch (err) { notify(err instanceof Error ? err.message : 'Error'); }
  }

  // ---- boot / auth screens ----
  if (authChecking) {
    return <div className="boot"><div className="spin" /></div>;
  }

  if (!session) {
    const lt = CRM_T[lang];
    const a = lt.auth;
    const POINT_ICONS = ['calendar', 'customers', 'wallet'];
    return (
      <div className="crm-auth">
        <div className="crm-auth-shell">
          {/* Product side. Deliberately the same navy as the signed-in sidebar, so the login
              looks like the front door of the CRM rather than an unrelated form. Hidden on
              narrow screens, where the space belongs to the keyboard and the two fields. */}
          <aside className="crm-auth-hero">
            <CRMLogo on="dark" />
            <h1 className="crm-auth-tagline">{a.tagline}</h1>
            <ul className="crm-auth-points">
              {(a.points as string[]).map((point, i) => (
                <li key={point}>
                  <span className="crm-auth-point-ic"><Ic name={POINT_ICONS[i]} size={16} stroke={2.2} /></span>
                  {point}
                </li>
              ))}
            </ul>
            <span className="crm-auth-domain">easyq.uz</span>
          </aside>

          {/* role="main" because the signed-in CRM has a real <main> and this screen had none —
              the hero beside it is an <aside>, so without this the login form belonged to no
              landmark at all and "skip to content" had nowhere to go. */}
          <div className="crm-auth-form" role="main">
            {/* Language first, and before sign-in on purpose: the CRM's own switcher lives
                inside the sidebar, so until now someone whose Uzbek is shaky had to log in
                through a language they could not read to reach the control that changes it. */}
            <div className="crm-auth-langs">
              {CRM_LANGS.map((L) => (
                <button
                  key={L.code}
                  type="button"
                  onClick={() => setLang(L.code)}
                  className={`crm-auth-lang${lang === L.code ? ' crm-auth-lang--on' : ''}`}
                >
                  {L.label}
                </button>
              ))}
            </div>

            <h2 className="crm-auth-title">{a.title}</h2>
            <p className="crm-auth-sub">{lt.set.credentialsSub}</p>

            <form onSubmit={(e) => void handleLoginSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="crm-auth-input" aria-label={lt.set.username} value={loginForm.username} onChange={(e) => setLoginForm((c) => ({ ...c, username: e.target.value }))} placeholder={lt.set.username} autoComplete="username" autoCapitalize="none" spellCheck={false} />
              <div className="crm-auth-pw">
                <input className="crm-auth-input" aria-label={lt.set.currentPassword} type={showPassword ? 'text' : 'password'} value={loginForm.password} onChange={(e) => setLoginForm((c) => ({ ...c, password: e.target.value }))} placeholder={lt.set.currentPassword} autoComplete="current-password" />
                {/* Owner-issued temporary passwords are random strings typed on a phone, so
                    being able to see what you typed is the difference between one attempt
                    and four. The label survives as the accessible name and the tooltip —
                    an icon-only control with no name is invisible to a screen reader. */}
                <button
                  type="button"
                  className="crm-auth-reveal"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? a.hide : a.show}
                  aria-pressed={showPassword}
                  title={showPassword ? a.hide : a.show}
                >
                  <Ic name={showPassword ? 'eyeOff' : 'eye'} size={18} stroke={2} />
                </button>
              </div>
              {loginError && <div className="crm-auth-error"><Ic name="bell" size={15} stroke={2.2} style={{ flex: 'none' }} />{loginError}</div>}
              <button type="submit" disabled={authSubmitting} className="crm-auth-submit">
                {authSubmitting ? '…' : LOGIN_LABEL[lang]}
              </button>
            </form>

            {/* Staff cannot reset their own password — only an owner can issue a new one. Said
                here because the alternative is the person retrying until they call someone. */}
            <p className="crm-auth-help">{a.help}</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- authed shell ----
  // The role is whatever the SESSION says. It used to be read from localStorage, so the
  // user picked their own permissions — harmless while nothing was enforced, wrong now.
  const role: Role = session.role;
  const roleAllowed = ROLE_SCREENS[role];
  const allowed = REAL_SCREENS.filter((s) => !roleAllowed || roleAllowed.includes(s));
  const effActive = allowed.includes(active) ? active : 'dashboard';
  // The screen is keyed on `effActive` ALONE, never on `lang`.
  //
  // `key={effActive + lang}` meant switching language changed the key, so React unmounted
  // and remounted the screen — throwing away the calendar's day/week/month choice, whichever
  // Settings section was open, search boxes and filters. It read as a page reload.
  //
  // It was never needed: `t` reaches these components through context, so a language change
  // re-renders them regardless. Nothing reads a translation in a useState initialiser, and
  // the one component that derives state from `t` re-syncs itself with a `[t]` effect.
  const ScreenComp = SCREEN_COMPONENTS[effActive] || Dashboard;

  const bizName = payload?.business.name || t.biz;
  const bizType = payload?.business.type || t.bizType;

  // Mirrors booking:create in server/permissions.ts, where a specialist now holds it.
  const canBook = role === 'owner' || role === 'manager' || role === 'specialist';
  // A specialist can only ever book onto themselves, so the modal opens on them. Cosmetic:
  // createCrmBooking overwrites the staff id for any scoped role whatever is sent.
  const ownStaffId = role === 'specialist' ? session.staffId : null;
  const newBooking = canBook ? { label: t.newBooking, run: () => setBookingCreator({ staffId: ownStaffId }) } : null;

  const titles: Record<string, { title: string; sub?: string | null; action?: { label: string; run: () => void } | null }> = {
    dashboard: { title: t.nav.dashboard, sub: t.dash.subtitle, action: newBooking },
    calendar: { title: t.nav.calendar, sub: null, action: newBooking },
    customers: {
      title: t.cust.title,
      sub: `${payload?.clients.length ?? 0} ${t.cust.count}`,
      action: canBook ? { label: t.cust.add, run: () => setBookingCreator({ staffId: ownStaffId }) } : null,
    },
    staff: { title: t.staff.title, sub: null, action: { label: t.staff.add, run: () => setStaffCreateOpen(true) } },
    services: { title: t.serv.title, sub: null, action: { label: t.serv.add, run: () => setServiceEditor({ initial: null }) } },
    inventory: { title: t.nav.inventory, sub: t.inv.sub, action: { label: t.inv.add, run: () => setModal({ type: 'product' }) } },
    finance: { title: t.nav.finance, sub: t.fin.sub, action: null },
    help: { title: t.nav.help, sub: t.help.sub, action: null },
    loyalty: { title: t.nav.loyalty, sub: t.loy.sub, action: null },
    payroll: { title: t.nav.payroll, sub: t.pay.sub, action: null },
    reviews: { title: t.nav.reviews, sub: t.rev.sub, action: null },
    marketing: { title: t.nav.marketing, sub: t.mkt.sub, action: null },
    automations: { title: t.nav.automations, sub: t.auto.sub, action: { label: t.auto.add, run: () => setModal({ type: 'rule' }) } },
    analytics: { title: t.an.title, sub: t.an.sub, action: null },
    branding: { title: t.nav.branding, sub: t.set.brandSub, action: null },
    settings: { title: t.nav.settings, sub: t.set.sub, action: null },
  };
  const meta = titles[effActive] || titles.dashboard;

  const crmValue: CRMContextValue = {
    lang, t, m: CRM_M[lang], bizName, bizType, demo: false,
    // null when nothing is uploaded, so the sidebar falls back to the name's initial.
    logoVersion: payload?.business.photoFileId ? payload.generatedAt : null, setLang, setActive, branch, setBranch, role, staffName: session.staffName, isTemporaryPassword: session.isTemporaryPassword, allowed, navOpen, setNavOpen,
    openModal: (type) => setModal({ type }),
    notify,
    logout: () => void handleLogout(),
    startTour: () => setTourOpen(true),
  };

  const dataValue: DataValue = {
    payload, selectedDate, setSelectedDate, reload: () => void reload(), loading, dayCache, ensureDays,
    openBooking: setSelectedBooking,
    openClient: setSelectedClient,
    // Guarded rather than passed straight through: this reaches the Staff screen, which a
    // manager can open, and canBook is the same condition the topbar action uses.
    openBookingFor: (staffId) => { if (canBook) setBookingCreator({ staffId: ownStaffId ?? staffId }); },
    openStaffEditor: (e) => (e ? setStaffEditor(e) : setStaffCreateOpen(true)),
    openSlots: setSlotEditor,
    createStaff: (name) => void doCreateStaff({ name, role: '', phone: '' }),
    openServiceEditor: (s) => setServiceEditor({ initial: s }),
    toggleServiceActive: (s) => void doToggleService(s),
    openBusinessEditor: () => setBusinessEditor(true),
    openCredentialsEditor: () => setCredentialsEditor(true),
    openPasswordEditor: () => setPasswordEditor(true),
    uploadBusinessPhoto: () => { photoTarget.current = { kind: 'logo' }; photoInputRef.current?.click(); },
    deleteBusinessPhoto: () => void doDeletePhoto(),
    uploadStaffPhoto: (staffId) => { photoTarget.current = { kind: 'staff', staffId }; photoInputRef.current?.click(); },
    deleteStaffPhoto: (staffId) => void doDeleteStaffPhoto(staffId),
    uploadServicePhoto: (serviceId) => { photoTarget.current = { kind: 'service', serviceId }; photoInputRef.current?.click(); },
    deleteServicePhoto: (serviceId) => void doDeleteServicePhoto(serviceId),
  };


  // A lapsed subscription replaces the CRM entirely rather than disabling parts of it. Half a
  // product with buttons that do nothing is worse than a clear stop with a way to fix it.
  //
  // It deliberately does NOT touch the public booking page or the bots: the shop owes money,
  // their customers do not, and a customer who cannot book books somewhere else — which costs
  // the shop the very money being asked for.
  if (payload && !payload.subscription.active) {
    return (
      <CRMCtx.Provider value={crmValue}>
        <SubscriptionExpired subscription={payload.subscription} />
      </CRMCtx.Provider>
    );
  }

  return (
    <CRMCtx.Provider value={crmValue}>
      <DataCtx.Provider value={dataValue}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {navOpen && <div className="crm-nav-scrim" onClick={() => setNavOpen(false)} />}
          <Sidebar active={effActive} setActive={setActive} navOpen={navOpen} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {payload && <SubscriptionBanner subscription={payload.subscription} />}
            {/* Below the subscription banner on purpose: "your trial ends in 3 days" outranks
                "install the app", and two stacked banners should be in that order. Renders only
                inside the signed-in shell, so it is never shown on the login screen. */}
            <InstallPrompt />
            <Topbar title={meta.title} sub={meta.sub} onMenu={() => setNavOpen(true)} action={meta.action ? { label: meta.action.label, onClick: meta.action.run } : null} />
            <main style={{ flex: 1, minWidth: 0 }}>
              {/* Offline outranks both loading and error: when there is no network the spinner
                  is a lie and "failed to fetch" is a worse explanation than the true one. The
                  sidebar and topbar stay, so somebody can see where they were and that the app
                  itself has not fallen over. */}
              {!online ? (
                <OfflineState hasPayload={Boolean(payload)} onRetry={() => void reload()} />
              ) : loading && !payload ? (
                <div style={{ padding: 28 }}><div className="boot" style={{ height: 320 }}><div className="spin" /></div></div>
              ) : error || !payload ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontWeight: 600 }}>{error ?? '—'}</div>
              ) : (
                <ScreenComp key={effActive} />
              )}
            </main>
          </div>
        </div>

        {/* `accept` is narrowed off image/* to the three formats actually allowed, so the
            picker stops offering files that the server will refuse — GIF and SVG included. */}
        <input ref={photoInputRef} type="file" accept={IMAGE_ACCEPT_ATTR} style={{ display: 'none' }} onChange={(e) => void handlePhotoSelected(e)} />

        <ModalLayer modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); notify(); }} />

        {selectedBooking && <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} onStatus={(s) => void changeStatus(s)} onPay={(p) => void addPayment(p)} />}
        {selectedClient && <ClientHistoryModal client={selectedClient} onClose={() => setSelectedClient(null)} />}
        {staffCreateOpen && <StaffCreateModal onClose={() => setStaffCreateOpen(false)} onCreate={(v) => void doCreateStaff(v)} />}
        {staffEditor && (
          <StaffEditModal
            employee={staffEditor}
            /* Read from the live payload, not snapshotted — reload() after a grant must be
               reflected in the open modal. */
            access={payload?.staffAccess.find((a) => a.staffId === staffEditor.id)}
            issued={issuedCreds?.staffId === staffEditor.id ? issuedCreds : null}
            onClose={() => { setStaffEditor(null); setIssuedCreds(null); }}
            onSave={(v) => void doSaveStaff(v)}
            onDelete={() => void doDeleteStaff()}
            onAccess={role === 'owner' ? (level) => void doStaffAccess(staffEditor.id, level) : undefined}
          />
        )}
        {serviceEditor && <ServiceEditModal
          initial={serviceEditor.initial}
          staffOptions={payload?.employees ?? []}
          /* Categories this business has already used, so the modal suggests its own
             vocabulary rather than one we invented. */
          categories={Array.from(new Set((payload?.services ?? []).map((sv) => sv.category).filter(Boolean))).sort()}
          onClose={() => setServiceEditor(null)}
          onSave={(v) => void doSaveService(v)}
        />}
        {slotEditor && <SlotEditorModal employee={slotEditor} schedule={payload?.business.schedule ?? ''} onClose={() => setSlotEditor(null)} onSave={(v) => void doSaveSlots(v)} />}
        {businessEditor && payload && <BusinessModal initial={{ name: payload.business.name, type: payload.business.type, address: payload.business.address, phone: payload.business.phone, schedule: payload.business.schedule, description: payload.business.description ?? '' }} onClose={() => setBusinessEditor(false)} onSave={(v) => void doSaveBusiness(v)} />}
        {bookingCreator && payload && (
          <CrmBookingModal
            payload={payload}
            takenTimes={takenTimes}
            staffId={bookingCreator.staffId}
            lockStaff={role === 'specialist'}
            onDateChange={(d, sid) => void loadTakenTimes(d, sid)}
            onClose={() => { setBookingCreator(null); setTakenTimes([]); }}
            onSave={(v) => void doCreateBooking(v)}
          />
        )}
        {passwordEditor && <PasswordModal onClose={() => setPasswordEditor(false)} onSave={(v) => void doChangePassword(v)} />}
        {credentialsEditor && payload && <CredentialsModal initialUsername={payload.business.crmUsername ?? ''} onClose={() => setCredentialsEditor(false)} onSave={(v) => void doSaveCredentials(v)} />}

        <Toast msg={toast} />
        <Tour open={tourOpen} onClose={() => setTourOpen(false)} setActive={setActive} storageKey={tourKey} />
      </DataCtx.Provider>
    </CRMCtx.Provider>
  );
}
