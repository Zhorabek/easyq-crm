import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Ic } from './icons';
import { CRM_LANGS, type Role, useCRM } from './i18n';
import { Avatar, CRMLogo, iconBtn } from './ui';

const NAV_ITEMS: Array<[string, string]> = [
  ['dashboard', 'dashboard'],
  ['calendar', 'calendar'],
  ['customers', 'customers'],
  ['staff', 'staff'],
  ['services', 'services'],
  ['inventory', 'inventory'],
  ['finance', 'finance'],
  ['loyalty', 'loyalty'],
  ['payroll', 'payroll'],
  ['reviews', 'reviews'],
  ['marketing', 'marketing'],
  ['automations', 'automations'],
  ['analytics', 'analytics'],
];

export function Sidebar({ active, setActive, navOpen }: { active: string; setActive: (s: string) => void; navOpen: boolean }) {
  const { t, lang, setLang, branch, setBranch, role, setRole, allowed, bizName, setNavOpen, logout } = useCRM();
  const [branchOpen, setBranchOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const bRef = useRef<HTMLDivElement>(null);
  const rRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (bRef.current && !bRef.current.contains(e.target as Node)) setBranchOpen(false);
      if (rRef.current && !rRef.current.contains(e.target as Node)) setRoleOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const items = NAV_ITEMS.filter(([k]) => !allowed || allowed.includes(k));
  const curBranch = branch < 0 ? null : t.branches[branch];
  const headName = curBranch ? bizName + ' · ' + curBranch.name : bizName;
  const headSub = curBranch ? curBranch.type : t.branchAll;
  const roleNames: Record<Role, string> = { owner: t.roles.owner, receptionist: t.roles.receptionist, specialist: t.roles.specialist };
  const settingsAllowed = !allowed || allowed.includes('settings');

  return (
    <aside className={`crm-sidebar${navOpen ? ' crm-sidebar--open' : ''}`} style={{ width: 248, flex: 'none', background: 'var(--sidebar)', display: 'flex', flexDirection: 'column', padding: '20px 14px', position: 'sticky', top: 0, height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 22px' }}>
        <CRMLogo />
        <button className="crm-navclose" onClick={() => setNavOpen(false)} style={{ display: 'none', width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,.08)', color: '#fff', placeItems: 'center' }}>
          <Ic name="x" size={18} />
        </button>
      </div>

      {/* branch switcher (cosmetic — one real business per login) */}
      <div ref={bRef} style={{ position: 'relative', marginBottom: 16 }}>
        <button onClick={() => setBranchOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 12, background: branchOpen ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.05)', textAlign: 'left' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: curBranch ? 'linear-gradient(135deg,#CBA988,#9c7a58)' : 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none', color: curBranch ? '#2a1d10' : 'var(--accent-ink)' }}>
            <Ic name={curBranch ? 'scissors' : 'grid'} size={17} stroke={2} />
          </span>
          <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{headName}</div>
            <div style={{ fontSize: 11, color: 'var(--on-sidebar-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{headSub}</div>
          </div>
          <Ic name="chevD" size={15} style={{ color: 'var(--on-sidebar-2)', flex: 'none', transform: branchOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        {branchOpen && (
          <div style={{ position: 'absolute', top: 54, left: 0, right: 0, background: 'var(--sidebar-2)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 6, zIndex: 30, boxShadow: '0 18px 40px -16px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--on-sidebar-2)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 10px 4px' }}>{t.branchesLabel}</div>
            {[{ name: t.branchAll, all: true } as any].concat(t.branches).map((b: any, i: number) => {
              const idx = i - 1;
              const on = branch === idx;
              return (
                <button key={i} onClick={() => { setBranch(idx); setBranchOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, textAlign: 'left', background: on ? 'rgba(180,217,78,.16)' : 'transparent' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: b.all ? 'var(--accent)' : 'linear-gradient(135deg,#CBA988,#9c7a58)', color: b.all ? 'var(--accent-ink)' : '#2a1d10', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <Ic name={b.all ? 'grid' : 'pin'} size={14} stroke={2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--accent)' : '#fff', whiteSpace: 'nowrap' }}>{b.name}</div>
                    {!b.all && <div className="tnum" style={{ fontSize: 10.5, color: 'var(--on-sidebar-2)' }}>{b.today} · {b.staff} {t.nav.staff.toLowerCase()}</div>}
                  </div>
                  {on && <Ic name="check" size={15} stroke={2.6} style={{ color: 'var(--accent)', flex: 'none' }} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <nav className="crm-navscroll" style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', flex: '0 1 auto', minHeight: 0 }}>
        {items.map(([key]) => {
          const on = active === key;
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`crm-navbtn${on ? ' crm-navbtn--on' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 11, textAlign: 'left', fontSize: 14.5, fontWeight: on ? 800 : 600, color: on ? 'var(--accent-ink)' : 'var(--on-sidebar-2)', background: on ? 'var(--accent)' : 'transparent', transition: 'color .15s', flex: 'none' }}
            >
              <Ic name={key} size={19} stroke={on ? 2.2 : 1.9} />
              {t.nav[key]}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div className="crm-langsw-m" style={{ display: 'none', gap: 6, padding: '8px 4px 12px' }}>
          {CRM_LANGS.map((L) => {
            const on = L.code === lang;
            return (
              <button key={L.code} onClick={() => setLang(L.code)} style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '9px 0', borderRadius: 9, color: on ? 'var(--accent-ink)' : 'var(--on-sidebar-2)', background: on ? 'var(--accent)' : 'rgba(255,255,255,.06)' }}>
                {L.label}
              </button>
            );
          })}
        </div>
        {settingsAllowed && (
          <button onClick={() => setActive('settings')} className="crm-navbtn crm-navbtn--on2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 11, fontSize: 14.5, fontWeight: 600, color: active === 'settings' ? '#fff' : 'var(--on-sidebar-2)', background: active === 'settings' ? 'rgba(255,255,255,.06)' : 'transparent' }}>
            <Ic name="settings" size={19} />
            {t.nav.settings}
          </button>
        )}
        {/* role switcher */}
        <div ref={rRef} style={{ position: 'relative', marginTop: 6, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 8 }}>
          <button onClick={() => setRoleOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 11, textAlign: 'left', background: roleOpen ? 'rgba(255,255,255,.06)' : 'transparent' }}>
            <Avatar name="Sardor Karimov" color="#B4D94E" size={34} />
            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>Sardor K.</div>
              <div style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.roles.viewAs} {roleNames[role]}</div>
            </div>
            <Ic name="chevD" size={14} style={{ color: 'var(--on-sidebar-2)', flex: 'none', transform: roleOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {roleOpen && (
            <div style={{ position: 'absolute', bottom: 50, left: 0, right: 0, background: 'var(--sidebar-2)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 6, zIndex: 30, boxShadow: '0 18px 40px -16px rgba(0,0,0,.6)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--on-sidebar-2)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 10px 4px' }}>{t.roles.viewAs}</div>
              {(['owner', 'receptionist', 'specialist'] as Role[]).map((r) => {
                const on = role === r;
                return (
                  <button key={r} onClick={() => { setRole(r); setRoleOpen(false); setActive('dashboard'); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, textAlign: 'left', background: on ? 'rgba(180,217,78,.16)' : 'transparent' }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.08)', color: on ? 'var(--accent)' : '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>
                      <Ic name={r === 'owner' ? 'loyalty' : r === 'receptionist' ? 'customers' : 'staff'} size={14} stroke={2} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--accent)' : '#fff', whiteSpace: 'nowrap' }}>{roleNames[r]}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--on-sidebar-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.roles.roleDesc[r]}</div>
                    </div>
                    {on && <Ic name="check" size={15} stroke={2.6} style={{ color: 'var(--accent)', flex: 'none' }} />}
                  </button>
                );
              })}
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', margin: '6px 4px' }} />
              <button onClick={logout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, textAlign: 'left', color: 'var(--rose)', fontSize: 13, fontWeight: 700 }}>
                <Ic name="logout" size={16} />
                {t.set.logout}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

const NOTIF_META: Record<string, { icon: string; c: string; t: string }> = {
  booking: { icon: 'calendar', c: 'var(--accent-deep)', t: 'var(--accent-tint)' },
  cancel: { icon: 'x', c: 'var(--rose)', t: 'var(--rose-t)' },
  review: { icon: 'star', c: 'var(--amber)', t: 'var(--amber-t)' },
  stock: { icon: 'box', c: 'var(--violet)', t: 'var(--violet-t)' },
  payment: { icon: 'wallet', c: 'var(--blue)', t: 'var(--blue-t)' },
};

function NotifBell() {
  const { t } = useCRM();
  const n = t.notif;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>(() => n.items.map((x: any) => ({ ...x })));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setItems(n.items.map((x: any) => ({ ...x }))); }, [t]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const unread = items.filter((x) => x.unread).length;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} className="crm-iconbtn" style={{ ...iconBtn, position: 'relative', background: open ? 'var(--accent-tint)' : 'var(--panel-2)', color: open ? 'var(--accent-deep)' : 'var(--ink-2)' }}>
        <Ic name="bell" size={18} />
        {unread > 0 && (
          <span className="tnum" style={{ position: 'absolute', top: 5, right: 6, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--rose)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid var(--panel)' }}>{unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 48, right: 0, width: 360, maxWidth: '85vw', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', zIndex: 60, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{n.title}</div>
            {unread > 0 && <button onClick={() => setItems(items.map((x) => ({ ...x, unread: false })))} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-deep)' }}>{n.markAll}</button>}
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.map((it, i) => {
              const meta = NOTIF_META[it.type] || NOTIF_META.booking;
              return (
                <div key={i} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, unread: false } : x)))} style={{ display: 'flex', gap: 12, padding: '13px 16px', borderTop: i ? '1px solid var(--line)' : 'none', background: it.unread ? 'color-mix(in srgb, var(--accent) 6%, var(--panel))' : 'var(--panel)', cursor: 'pointer' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: meta.t, color: meta.c, display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <Ic name={meta.icon} size={18} stroke={2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                      {it.title}
                      {it.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rose)', flex: 'none' }} />}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{it.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600, marginTop: 4 }}>{it.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ title, sub, action, onMenu, extra }: { title: string; sub?: string | null; action?: { label: string; onClick: () => void } | null; onMenu: () => void; extra?: React.ReactNode }) {
  const { t, lang, setLang, theme, setTheme } = useCRM();
  return (
    <header className="crm-topbar" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '20px 28px', borderBottom: '1px solid var(--line)', background: 'var(--panel)', position: 'sticky', top: 0, zIndex: 20 }}>
      <button className="crm-burger" onClick={onMenu} style={{ display: 'none', width: 40, height: 40, borderRadius: 11, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', placeItems: 'center', flex: 'none' }}>
        <Ic name="menu" size={20} />
      </button>
      <div className="crm-title" style={{ minWidth: 0, flex: '0 0 auto', overflow: 'hidden' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
        {sub && <div className="crm-sub" style={{ fontSize: 13.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>

      <div className="crm-search" style={{ marginLeft: 12, flex: 1, maxWidth: 420, display: 'flex', alignItems: 'center', gap: 9, background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 11, padding: '9px 13px' }}>
        <Ic name="search" size={17} style={{ color: 'var(--ink-3)', flex: 'none' }} />
        <input placeholder={t.search} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13.5, color: 'var(--ink)', width: '100%' }} />
      </div>

      <div className="crm-topctl" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {extra}
        <div className="crm-langsw" style={{ display: 'inline-flex', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3, gap: 2 }}>
          {CRM_LANGS.map((L) => {
            const on = L.code === lang;
            return (
              <button key={L.code} onClick={() => setLang(L.code)} style={{ fontSize: 12.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, color: on ? 'var(--accent-ink)' : 'var(--ink-3)', background: on ? 'var(--accent)' : 'transparent' }}>
                {L.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="crm-iconbtn" style={iconBtn as CSSProperties}>
          <Ic name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <NotifBell />
        {action && (
          <button onClick={action.onClick} className="crm-addbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 13.5, padding: '10px 16px', borderRadius: 11, whiteSpace: 'nowrap', boxShadow: '0 6px 16px -8px rgba(132,169,46,.6)', flex: 'none' }}>
            <Ic name="plus" size={17} stroke={2.4} />
            <span className="crm-addlabel">{action.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}
