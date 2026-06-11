import { type FC, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createBookingPayment,
  createEmployee,
  createService,
  deleteBusinessPhoto as apiDeleteBusinessPhoto,
  deleteEmployee,
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
import { generateHalfHourIntervals, isoToday } from './lib/date';
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
import { CRM_M, CRM_T, CRMCtx, type CRMContextValue, type Lang, type Role, type Theme } from './crm/i18n';
import { DataCtx, type DataValue } from './crm/data';
import { Toast } from './crm/ui';
import { Sidebar, Topbar } from './crm/shell';
import { Analytics, Calendar, Customers, Dashboard, Finance, Services, Settings, Staff } from './crm/screens-real';
import { Automations, Inventory, Loyalty, Marketing, Payroll, Reviews } from './crm/screens-mock';
import {
  BookingDetailModal,
  BusinessModal,
  ClientHistoryModal,
  CredentialsModal,
  ModalLayer,
  ServiceEditModal,
  SlotEditorModal,
  StaffCreateModal,
  StaffEditModal,
} from './crm/modals';

const SCREEN_COMPONENTS: Record<string, FC> = {
  dashboard: Dashboard,
  calendar: Calendar,
  customers: Customers,
  staff: Staff,
  services: Services,
  inventory: Inventory,
  finance: Finance,
  loyalty: Loyalty,
  payroll: Payroll,
  reviews: Reviews,
  marketing: Marketing,
  automations: Automations,
  analytics: Analytics,
  settings: Settings,
};

const ROLE_SCREENS: Record<Role, string[] | null> = {
  owner: null,
  receptionist: ['dashboard', 'calendar', 'customers', 'services', 'inventory', 'reviews', 'automations', 'settings'],
  specialist: ['dashboard', 'calendar', 'customers', 'settings'],
};

const LOGIN_LABEL: Record<Lang, string> = { uz: 'Kirish', ru: 'Войти', en: 'Sign in' };

function lsGet(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // ---- auth ----
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string | null>(null);

  // ---- ui prefs ----
  const [lang, setLangState] = useState<Lang>(() => lsGet('easyq_crm_lang', 'uz') as Lang);
  const [theme, setThemeState] = useState<Theme>(() => (lsGet('easyq_crm_theme', 'light') === 'dark' ? 'dark' : 'light'));
  const [active, setActiveState] = useState<string>(() => lsGet('easyq_crm_screen', 'dashboard'));
  const [branch, setBranchState] = useState<number>(() => parseInt(lsGet('easyq_crm_branch', '-1'), 10));
  const [role, setRoleState] = useState<Role>(() => lsGet('easyq_crm_role', 'owner') as Role);
  const [navOpen, setNavOpen] = useState(false);

  // ---- data ----
  const [payload, setPayload] = useState<CrmPayload | null>(null);
  const [selectedDate, setSelectedDateState] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const t = CRM_T[lang] || CRM_T.uz;

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
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

  function setLang(c: Lang) { setLangState(c); try { localStorage.setItem('easyq_crm_lang', c); } catch {} }
  function setTheme(th: Theme) { setThemeState(th); try { localStorage.setItem('easyq_crm_theme', th); } catch {} }
  function setActive(s: string) { setActiveState(s); try { localStorage.setItem('easyq_crm_screen', s); } catch {} setNavOpen(false); }
  function setBranch(b: number) { setBranchState(b); try { localStorage.setItem('easyq_crm_branch', String(b)); } catch {} }
  function setRole(r: Role) { setRoleState(r); try { localStorage.setItem('easyq_crm_role', r); } catch {} }
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
  async function doCreateStaff(name: string) {
    await createEmployee({ name });
    setStaffCreateOpen(false);
    notify();
    await reload();
  }
  async function doSaveStaff(name: string) {
    if (!staffEditor) return;
    await updateEmployee(staffEditor.id, { name });
    setStaffEditor(null);
    notify();
    await reload();
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
  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { await apiUploadBusinessPhoto(file); notify(); await reload(); } catch (err) { notify(err instanceof Error ? err.message : 'Error'); }
  }
  async function doDeletePhoto() {
    try { await apiDeleteBusinessPhoto(); notify(); await reload(); } catch (err) { notify(err instanceof Error ? err.message : 'Error'); }
  }

  // ---- boot / auth screens ----
  if (authChecking) {
    return <div className="boot"><div className="spin" /></div>;
  }

  if (!session) {
    const lt = CRM_T[lang];
    return (
      <div className="crm-auth">
        <div className="crm-auth-card">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#1A2406" strokeWidth="2.4" /><path d="M15.5 15.5 L20 20" stroke="#1A2406" strokeWidth="2.6" strokeLinecap="round" /></svg>
              </span>
              <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.03em', color: 'var(--ink)' }}>easy<span style={{ color: 'var(--accent-deep)' }}>Q</span></span>
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', margin: '0 0 4px', letterSpacing: '-.02em' }}>EasyQ CRM</h1>
          <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--ink-3)', fontWeight: 600, margin: '0 0 22px' }}>{lt.set.credentialsSub}</p>
          <form onSubmit={(e) => void handleLoginSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input className="crm-auth-input" value={loginForm.username} onChange={(e) => setLoginForm((c) => ({ ...c, username: e.target.value }))} placeholder={lt.set.username} autoComplete="username" />
            <input className="crm-auth-input" type="password" value={loginForm.password} onChange={(e) => setLoginForm((c) => ({ ...c, password: e.target.value }))} placeholder={lt.set.currentPassword} autoComplete="current-password" />
            {loginError && <div style={{ fontSize: 13, color: 'var(--rose)', fontWeight: 700 }}>{loginError}</div>}
            <button type="submit" disabled={authSubmitting} style={{ marginTop: 4, padding: '13px', borderRadius: 11, fontSize: 15, fontWeight: 800, color: 'var(--accent-ink)', background: 'var(--accent)', boxShadow: '0 8px 18px -8px rgba(132,169,46,.6)' }}>
              {authSubmitting ? '…' : LOGIN_LABEL[lang]}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---- authed shell ----
  const allowed = ROLE_SCREENS[role];
  const effActive = allowed && !allowed.includes(active) ? 'dashboard' : active;
  const ScreenComp = SCREEN_COMPONENTS[effActive] || Dashboard;

  const bizName = payload?.business.name || t.biz;
  const bizType = payload?.business.type || t.bizType;

  const titles: Record<string, { title: string; sub?: string | null; action?: { label: string; run: () => void } | null }> = {
    dashboard: { title: t.nav.dashboard, sub: t.dash.subtitle, action: { label: t.newBooking, run: () => setModal({ type: 'booking' }) } },
    calendar: { title: t.nav.calendar, sub: null, action: { label: t.newBooking, run: () => setModal({ type: 'booking' }) } },
    customers: { title: t.cust.title, sub: `${payload?.clients.length ?? 0} ${t.cust.count}`, action: { label: t.cust.add, run: () => setModal({ type: 'customer' }) } },
    staff: { title: t.staff.title, sub: null, action: { label: t.staff.add, run: () => setStaffCreateOpen(true) } },
    services: { title: t.serv.title, sub: null, action: { label: t.serv.add, run: () => setServiceEditor({ initial: null }) } },
    inventory: { title: t.nav.inventory, sub: t.inv.sub, action: { label: t.inv.add, run: () => setModal({ type: 'product' }) } },
    finance: { title: t.nav.finance, sub: t.fin.sub, action: null },
    loyalty: { title: t.nav.loyalty, sub: t.loy.sub, action: null },
    payroll: { title: t.nav.payroll, sub: t.pay.sub, action: null },
    reviews: { title: t.nav.reviews, sub: t.rev.sub, action: null },
    marketing: { title: t.nav.marketing, sub: t.mkt.sub, action: null },
    automations: { title: t.nav.automations, sub: t.auto.sub, action: { label: t.auto.add, run: () => setModal({ type: 'rule' }) } },
    analytics: { title: t.an.title, sub: t.an.sub, action: null },
    settings: { title: t.nav.settings, sub: t.set.sub, action: null },
  };
  const meta = titles[effActive] || titles.dashboard;

  const crmValue: CRMContextValue = {
    lang, t, m: CRM_M[lang], bizName, bizType, setLang, theme, setTheme, branch, setBranch, role, setRole, allowed, navOpen, setNavOpen,
    openModal: (type) => setModal({ type }),
    notify,
    logout: () => void handleLogout(),
  };

  const dataValue: DataValue = {
    payload, selectedDate, setSelectedDate, reload: () => void reload(), loading, dayCache, ensureDays,
    openBooking: setSelectedBooking,
    openClient: setSelectedClient,
    openStaffEditor: (e) => (e ? setStaffEditor(e) : setStaffCreateOpen(true)),
    openSlots: setSlotEditor,
    createStaff: (name) => void doCreateStaff(name),
    openServiceEditor: (s) => setServiceEditor({ initial: s }),
    toggleServiceActive: (s) => void doToggleService(s),
    openBusinessEditor: () => setBusinessEditor(true),
    openCredentialsEditor: () => setCredentialsEditor(true),
    uploadBusinessPhoto: () => photoInputRef.current?.click(),
    deleteBusinessPhoto: () => void doDeletePhoto(),
  };

  const intervals = payload ? generateHalfHourIntervals(payload.business.schedule).map((i) => i.start) : [];

  return (
    <CRMCtx.Provider value={crmValue}>
      <DataCtx.Provider value={dataValue}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {navOpen && <div className="crm-nav-scrim" onClick={() => setNavOpen(false)} />}
          <Sidebar active={effActive} setActive={setActive} navOpen={navOpen} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Topbar title={meta.title} sub={meta.sub} onMenu={() => setNavOpen(true)} action={meta.action ? { label: meta.action.label, onClick: meta.action.run } : null} />
            <main style={{ flex: 1, minWidth: 0 }}>
              {loading && !payload ? (
                <div style={{ padding: 28 }}><div className="boot" style={{ height: 320 }}><div className="spin" /></div></div>
              ) : error || !payload ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontWeight: 600 }}>{error ?? '—'}</div>
              ) : (
                <ScreenComp key={effActive + lang} />
              )}
            </main>
          </div>
        </div>

        <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void handlePhotoSelected(e)} />

        <ModalLayer modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); notify(); }} />

        {selectedBooking && <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} onStatus={(s) => void changeStatus(s)} onPay={(p) => void addPayment(p)} />}
        {selectedClient && <ClientHistoryModal client={selectedClient} onClose={() => setSelectedClient(null)} />}
        {staffCreateOpen && <StaffCreateModal onClose={() => setStaffCreateOpen(false)} onCreate={(name) => void doCreateStaff(name)} />}
        {staffEditor && <StaffEditModal employee={staffEditor} onClose={() => setStaffEditor(null)} onSave={(name) => void doSaveStaff(name)} onDelete={() => void doDeleteStaff()} />}
        {serviceEditor && <ServiceEditModal initial={serviceEditor.initial} staffOptions={payload?.employees ?? []} onClose={() => setServiceEditor(null)} onSave={(v) => void doSaveService(v)} />}
        {slotEditor && <SlotEditorModal employee={slotEditor} intervals={intervals} onClose={() => setSlotEditor(null)} onSave={(v) => void doSaveSlots(v)} />}
        {businessEditor && payload && <BusinessModal initial={{ name: payload.business.name, type: payload.business.type, address: payload.business.address, phone: payload.business.phone, schedule: payload.business.schedule, description: payload.business.description ?? '' }} onClose={() => setBusinessEditor(false)} onSave={(v) => void doSaveBusiness(v)} />}
        {credentialsEditor && payload && <CredentialsModal initialUsername={payload.business.crmUsername ?? ''} onClose={() => setCredentialsEditor(false)} onSave={(v) => void doSaveCredentials(v)} />}

        <Toast msg={toast} />
      </DataCtx.Provider>
    </CRMCtx.Provider>
  );
}
