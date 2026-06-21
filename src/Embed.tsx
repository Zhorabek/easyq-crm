import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import './crm/crm.css';
import { CRM_M, CRM_T, CRMCtx, type CRMContextValue, type Lang, type Role, type Theme } from './crm/i18n';
import { DataCtx, type DataValue } from './crm/data';
import { Toast } from './crm/ui';
import { Sidebar, Topbar } from './crm/shell';
import { Analytics, Calendar, Customers, Dashboard, Finance, Services, Settings, Staff } from './crm/screens-real';
import { Automations, Inventory, Loyalty, Marketing, Payroll, Reviews } from './crm/screens-mock';
import { buildMockPayload } from './crm/mock';
import { isoToday } from './lib/date';
import type { CrmPayload } from './types';

/**
 * Public, no-auth demo of the CRM, rendered when the SPA is loaded with `?embed=1`
 * (used inside an <iframe> on the marketing landing page). It renders the real
 * data-backed screens against a static mock payload — no auth, no API calls — and
 * accepts live screen/lang/theme changes from the parent via postMessage.
 */

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

function readParam(name: string, fallback: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name) || fallback;
  } catch {
    return fallback;
  }
}

export default function EmbedApp() {
  const [lang, setLang] = useState<Lang>(() => readParam('lang', 'uz') as Lang);
  const [theme, setTheme] = useState<Theme>(() => (readParam('theme', 'light') === 'dark' ? 'dark' : 'light'));
  const [active, setActive] = useState<string>(() => readParam('screen', 'calendar'));
  const [role, setRole] = useState<Role>('owner');
  const [branch, setBranch] = useState(-1);
  const [navOpen, setNavOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(isoToday());
  const [dayCache, setDayCache] = useState<Record<string, CrmPayload>>({});

  const t = CRM_T[lang] || CRM_T.uz;
  const payload = useMemo(() => buildMockPayload(selectedDate, lang), [selectedDate, lang]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // names are localized, so a language change invalidates the cached days
  useEffect(() => { setDayCache({}); }, [lang]);
  useEffect(() => {
    if (!toast) return;
    const tm = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(tm);
  }, [toast]);

  // accept live screen/lang/theme from the landing page
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = (e.data || {}) as { easyqcrm?: boolean; screen?: string; lang?: Lang; theme?: Theme };
      if (!d.easyqcrm) return;
      if (d.screen) setActive(d.screen);
      if (d.lang) setLang(d.lang);
      if (d.theme) setTheme(d.theme);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const notify = (msg?: string) => setToast(msg || t.set.saved);

  const ensureDays = (dates: string[]) => {
    const missing = dates.filter((d) => d !== selectedDate && !dayCache[d]);
    if (missing.length === 0) return;
    setDayCache((c) => {
      const next = { ...c };
      for (const d of missing) if (!next[d]) next[d] = buildMockPayload(d, lang);
      return next;
    });
  };

  const allowed = ROLE_SCREENS[role];
  const effActive = allowed && !allowed.includes(active) ? 'dashboard' : active;
  const ScreenComp = SCREEN_COMPONENTS[effActive] || Dashboard;

  const titles: Record<string, { title: string; sub?: string | null }> = {
    dashboard: { title: t.nav.dashboard, sub: t.dash.subtitle },
    calendar: { title: t.nav.calendar, sub: null },
    customers: { title: t.cust.title, sub: `${payload.clients.length} ${t.cust.count}` },
    staff: { title: t.staff.title, sub: null },
    services: { title: t.serv.title, sub: null },
    inventory: { title: t.nav.inventory, sub: t.inv.sub },
    finance: { title: t.nav.finance, sub: t.fin.sub },
    loyalty: { title: t.nav.loyalty, sub: t.loy.sub },
    payroll: { title: t.nav.payroll, sub: t.pay.sub },
    reviews: { title: t.nav.reviews, sub: t.rev.sub },
    marketing: { title: t.nav.marketing, sub: t.mkt.sub },
    automations: { title: t.nav.automations, sub: t.auto.sub },
    analytics: { title: t.an.title, sub: t.an.sub },
    settings: { title: t.nav.settings, sub: t.set.sub },
  };
  const meta = titles[effActive] || titles.dashboard;

  const crmValue: CRMContextValue = {
    lang,
    t,
    m: CRM_M[lang],
    bizName: payload.business.name,
    bizType: payload.business.type,
    setLang,
    theme,
    setTheme,
    branch,
    setBranch,
    role,
    setRole,
    allowed,
    navOpen,
    setNavOpen,
    openModal: () => notify(),
    notify,
    logout: () => {},
  };

  const noop = () => {};
  const dataValue: DataValue = {
    payload,
    selectedDate,
    setSelectedDate,
    reload: noop,
    loading: false,
    dayCache,
    ensureDays,
    openBooking: noop,
    openClient: noop,
    openStaffEditor: noop,
    openSlots: noop,
    createStaff: noop,
    openServiceEditor: noop,
    toggleServiceActive: noop,
    openBusinessEditor: noop,
    openCredentialsEditor: noop,
    uploadBusinessPhoto: noop,
    deleteBusinessPhoto: noop,
  };

  return (
    <CRMCtx.Provider value={crmValue}>
      <DataCtx.Provider value={dataValue}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {navOpen && <div className="crm-nav-scrim" onClick={() => setNavOpen(false)} />}
          <Sidebar active={effActive} setActive={(s) => { setActive(s); setNavOpen(false); }} navOpen={navOpen} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Topbar title={meta.title} sub={meta.sub} onMenu={() => setNavOpen(true)} action={null} />
            <main style={{ flex: 1, minWidth: 0 }}>
              <ScreenComp key={effActive + lang} />
            </main>
          </div>
        </div>
        <Toast msg={toast} />
      </DataCtx.Provider>
    </CRMCtx.Provider>
  );
}
