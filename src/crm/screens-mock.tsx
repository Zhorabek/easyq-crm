import { useEffect, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';
import { Avatar, Badge, Panel, Switch } from './ui';
import { CUSTOMERS, INV_NAME, INVENTORY, ROLE, SERVICES, SERV_NAME, STAFF } from './mock';

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

/* ============ INVENTORY ============ */
export function Inventory() {
  const { t, lang, notify } = useCRM();
  const v = t.inv;
  const statusOf = (p: { stock: number; min: number }) => (p.stock === 0 ? 'out' : p.stock <= p.min ? 'low' : 'in');
  const statusMeta: Record<string, { label: string; c: string; bg: string }> = {
    in: { label: v.inStock, c: 'var(--accent-deep)', bg: 'var(--accent-tint)' },
    low: { label: v.low, c: 'var(--amber)', bg: 'var(--amber-t)' },
    out: { label: v.out, c: 'var(--rose)', bg: 'var(--rose-t)' },
  };
  const lowItems = INVENTORY.filter((p) => statusOf(p) !== 'in');
  const parsePrice = (s: string) => parseInt(s.replace(/\s/g, ''), 10) || 0;
  const totalValue = INVENTORY.reduce((a, p) => a + parsePrice(p.price) * p.stock, 0);

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="crm-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[
          { icon: 'box', n: String(INVENTORY.length), l: v.items, c: 'var(--accent-deep)', bg: 'var(--accent-tint)' },
          { icon: 'bell', n: String(lowItems.length), l: v.lowAlerts, c: 'var(--amber)', bg: 'var(--amber-t)' },
          { icon: 'finance', n: fmt(totalValue), l: v.totalValue + ' · UZS', c: 'var(--blue)', bg: 'var(--blue-t)' },
        ].map((k, i) => (
          <Panel key={i} pad={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: k.bg, color: k.c, display: 'grid', placeItems: 'center', flex: 'none' }}>
                <Ic name={k.icon} size={20} stroke={2} />
              </span>
              <div>
                <div className="tnum" style={{ fontSize: 22, fontWeight: 800 }}>{k.n}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{k.l}</div>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <Panel pad={0} className="crm-tablewrap">
        <div className="crm-serv-head" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.2fr 1fr 1fr 0.9fr', gap: 12, padding: '14px 22px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>{v.colName}</div><div>{v.colCat}</div><div>{v.colStock}</div><div>{v.colPrice}</div><div>{v.colStatus}</div><div></div>
        </div>
        {INVENTORY.map((p, i) => {
          const st = statusOf(p);
          const meta = statusMeta[st];
          const pct = Math.min(100, Math.round((p.stock / (p.min * 2.5)) * 100));
          return (
            <div key={p.id} className="crm-serv-row" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.2fr 1fr 1fr 0.9fr', gap: 12, alignItems: 'center', padding: '13px 22px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${p.color} 16%, var(--panel))`, color: p.color, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Ic name="box" size={18} stroke={2} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{INV_NAME[lang][p.key]}</span>
              </div>
              <div><Badge color="var(--ink-2)" tint="var(--panel-2)">{v.cats[p.catKey]}</Badge></div>
              <div style={{ minWidth: 0 }}>
                <div className="tnum" style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 4 }}>{p.stock} <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{v.units}</span></div>
                <div style={{ height: 5, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: meta.c }} /></div>
              </div>
              <div className="tnum" style={{ fontSize: 13.5, fontWeight: 800 }}>{p.price}</div>
              <div><Badge color={meta.c} tint={meta.bg} dot>{meta.label}</Badge></div>
              <div style={{ textAlign: 'right' }}>
                <button onClick={() => notify(v.restock + ' · ' + INV_NAME[lang][p.key])} style={{ fontSize: 12.5, fontWeight: 800, color: st === 'in' ? 'var(--ink-3)' : 'var(--accent-deep)', background: st === 'in' ? 'var(--panel-2)' : 'var(--accent-tint)', padding: '7px 13px', borderRadius: 9, whiteSpace: 'nowrap' }}>{v.restock}</button>
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

/* ============ LOYALTY ============ */
export function Loyalty() {
  const { t } = useCRM();
  const l = t.loy;
  const [on, setOn] = useState(true);
  const tierColors = ['#B0703A', '#94A3B8', '#E0A93B'];
  const tierTints = ['#F3E7DA', '#EEF1F5', '#FBF1DA'];
  const top: Array<[number, number]> = [[2, 1240], [0, 920], [7, 640], [4, 510], [5, 380], [1, 240], [3, 90]];
  const tierOf = (p: number) => (p >= 800 ? 2 : p >= 300 ? 1 : 0);

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 46, height: 46, borderRadius: 13, background: 'var(--accent-tint)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="loyalty" size={24} stroke={2} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>{l.program}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{l.programDesc}</div>
          </div>
          <Switch on={on} onChange={setOn} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 11, background: 'var(--panel-2)', borderRadius: 12, padding: '13px 15px' }}>
            <Ic name="finance" size={18} stroke={2} style={{ color: 'var(--accent-deep)', flex: 'none' }} />
            <div><div style={{ fontSize: 13.5, fontWeight: 800 }}>{l.earnRule}</div><div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{l.earnRuleDesc}</div></div>
          </div>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 11, background: 'var(--panel-2)', borderRadius: 12, padding: '13px 15px' }}>
            <Ic name="star" size={18} fill style={{ color: 'var(--amber)', flex: 'none' }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{l.redeem}</div>
          </div>
        </div>
      </Panel>

      <div className="crm-staff-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <Panel key={i} style={{ borderTop: `3px solid ${tierColors[i]}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: tierTints[i], color: tierColors[i], display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="loyalty" size={19} stroke={2} /></span>
              <div><div style={{ fontSize: 15.5, fontWeight: 800 }}>{l.tierName[i]}</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700 }}>{l.tierReq[i]}</div></div>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-2)', fontWeight: 600, lineHeight: 1.5 }}>{l.tierPerk[i]}</div>
            <div className="tnum" style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>{top.filter((x) => tierOf(x[1]) === i).length} {l.members}</div>
          </Panel>
        ))}
      </div>

      <Panel pad={0}>
        <div style={{ padding: '18px 20px 12px', fontSize: 16, fontWeight: 800 }}>{l.topClients}</div>
        {top.map((row, i) => {
          const cu = CUSTOMERS[row[0]];
          const ti = tierOf(row[1]);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 20px', borderTop: '1px solid var(--line)' }}>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-3)', width: 18 }}>{i + 1}</span>
              <Avatar name={cu.name} color={cu.av} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cu.name}</div>
                <div className="tnum" style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{cu.visits} {l.visits}</div>
              </div>
              <Badge color={tierColors[ti]} tint={tierTints[ti]} dot>{l.tierName[ti]}</Badge>
              <div className="tnum" style={{ fontSize: 14.5, fontWeight: 800, width: 92, textAlign: 'right' }}>{fmt(row[1])} <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}>{l.points}</span></div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

/* ============ PAYROLL ============ */
export function Payroll() {
  const { t, lang, notify } = useCRM();
  const p = t.pay;
  const rows = STAFF.map((s, i) => {
    const done = [142, 118, 96, 64][i];
    const revM = [12.4, 9.8, 7.6, 5.1][i];
    const comm = [40, 35, 35, 45][i];
    const base = [2000, 2000, 1800, 1500][i];
    const payout = Math.round((revM * 1000 * comm) / 100 + base);
    return { s, done, revM, comm, base, payout };
  });
  const total = rows.reduce((a, r) => a + r.payout, 0);
  const fmtK = (k: number) => (k * 1000).toLocaleString('ru-RU').replace(/,/g, ' ');

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{p.total} · {p.month}</div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', marginTop: 2 }}>{fmtK(total)} <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 700 }}>UZS</span></div>
          </div>
          <button onClick={() => notify(p.paidToast)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 800, fontSize: 14.5, padding: '12px 22px', borderRadius: 12, boxShadow: '0 8px 18px -8px rgba(132,169,46,.6)' }}>
            <Ic name="finance" size={17} stroke={2.2} />{p.payAll}
          </button>
        </div>
      </Panel>

      <Panel pad={0} className="crm-tablewrap">
        <div className="crm-serv-head" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.1fr .9fr 1.2fr 1fr', gap: 12, padding: '14px 22px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>{p.staff}</div><div>{p.servicesDone}</div><div>{p.revenue}</div><div>{p.commission}</div><div style={{ textAlign: 'right' }}>{p.payout}</div><div></div>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="crm-serv-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.1fr .9fr 1.2fr 1fr', gap: 12, alignItems: 'center', padding: '13px 22px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <Avatar name={r.s.name} color={r.s.av} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.s.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{ROLE[lang][r.s.roleKey]}</div>
              </div>
            </div>
            <div className="tnum" style={{ fontSize: 13.5, fontWeight: 700 }}>{r.done}</div>
            <div className="tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{r.revM}M</div>
            <div><Badge color="var(--violet)" tint="var(--violet-t)">{r.comm}%</Badge></div>
            <div className="tnum" style={{ fontSize: 14, fontWeight: 800, textAlign: 'right' }}>{fmtK(r.payout)}</div>
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => notify(p.paidToast)} style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--accent-deep)', background: 'var(--accent-tint)', padding: '7px 13px', borderRadius: 9 }}>{p.pay}</button>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ============ REVIEWS ============ */
export function Reviews() {
  const { t, lang, notify } = useCRM();
  const r = t.rev;
  const baseReviews: Array<[number, number, number, number, number]> = [
    [2, 5, 0, 2, 1], [0, 5, 0, 0, 2], [7, 4, 1, 5, 3], [4, 5, 2, 4, 4], [1, 5, 3, 3, 6], [5, 4, 0, 0, 8],
  ];
  const [replied, setReplied] = useState<boolean[]>(() => [true, true, false, true, false, false]);
  const [openReply, setOpenReply] = useState(-1);
  const [draft, setDraft] = useState('');
  const texts: Record<string, string[]> = {
    uz: ['Juda mamnunman, ustalar professional! Albatta yana kelaman.', 'Eng yaxshi sartaroshxona, navbat olish ham juda oson.', 'Yaxshi, lekin biroz kutishga to‘g‘ri keldi.', 'Mukammal xizmat, rahmat!', 'Telegram orqali yozish juda qulay ekan.', 'Yaxshi joy, tavsiya qilaman.'],
    ru: ['Очень доволен, мастера профессионалы! Обязательно вернусь.', 'Лучший барбершоп, и записаться очень легко.', 'Хорошо, но немного пришлось подождать.', 'Идеальный сервис, спасибо!', 'Записываться через Telegram очень удобно.', 'Хорошее место, рекомендую.'],
    en: ['Very happy, the masters are pros! Will definitely come back.', 'Best barbershop, and booking is so easy.', 'Good, but had to wait a little.', 'Perfect service, thank you!', 'Booking through Telegram is so convenient.', 'Great place, recommend it.'],
  };
  const avg = (baseReviews.reduce((s, x) => s + x[1], 0) / baseReviews.length).toFixed(1);
  const dist = [5, 4, 3, 2, 1].map((star) => baseReviews.filter((x) => x[1] === star).length);
  const positive = Math.round((baseReviews.filter((x) => x[1] >= 4).length / baseReviews.length) * 100);
  const ago = (d: number) => (lang === 'ru' ? `${d} дн. назад` : lang === 'en' ? `${d}d ago` : `${d} kun oldin`);

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="crm-dash-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20, alignItems: 'start' }}>
        <Panel style={{ textAlign: 'center' }}>
          <div className="tnum" style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1 }}>{avg}</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 3, color: 'var(--amber)', margin: '8px 0 4px' }}>
            {[0, 1, 2, 3, 4].map((i) => <Ic key={i} name="star" size={18} fill={i < Math.round(Number(avg))} stroke={1.6} style={{ opacity: i < Math.round(Number(avg)) ? 1 : 0.3 }} />)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>{baseReviews.length} {r.total}</div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {dist.map((cnt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 10, color: 'var(--ink-2)' }}>{5 - i}</span>
                <Ic name="star" size={12} fill style={{ color: 'var(--amber)', flex: 'none' }} />
                <div style={{ flex: 1, height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: (cnt / baseReviews.length) * 100 + '%', height: '100%', background: 'var(--amber)' }} />
                </div>
                <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 16, textAlign: 'right', color: 'var(--ink-3)' }}>{cnt}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}><Badge color="var(--accent-deep)" tint="var(--accent-tint)" dot>{positive}% {r.positive}</Badge></div>
        </Panel>

        <Panel pad={0}>
          <div style={{ padding: '18px 20px 8px', fontSize: 16, fontWeight: 800 }}>{r.recent}</div>
          <div>
            {baseReviews.map((rv, i) => {
              const cu = CUSTOMERS[rv[0]];
              const st = STAFF[rv[2]];
              const isReplied = replied[i];
              return (
                <div key={i} style={{ padding: '15px 20px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <Avatar name={cu.name} color={cu.av} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{cu.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{st.name.split(' ')[0]} · {ago(rv[4])}</div>
                    </div>
                    <span style={{ display: 'inline-flex', gap: 1.5, color: 'var(--amber)' }}>
                      {[0, 1, 2, 3, 4].map((k) => <Ic key={k} name="star" size={13} fill={k < rv[1]} stroke={1.5} style={{ opacity: k < rv[1] ? 1 : 0.25 }} />)}
                    </span>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{texts[lang][i]}</p>
                  <div style={{ marginTop: 10 }}>
                    {isReplied ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--accent-deep)' }}><Ic name="check" size={13} stroke={2.6} />{r.replied}</span>
                    ) : openReply === i ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={r.replyPh} rows={2} style={{ width: '100%', resize: 'none', border: '1.5px solid var(--line-2)', background: 'var(--panel-2)', color: 'var(--ink)', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 500, outline: 'none', fontFamily: 'var(--font)' }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setReplied((rs) => rs.map((v, j) => (j === i ? true : v))); setOpenReply(-1); setDraft(''); notify(r.replyToast); }} disabled={!draft.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: draft.trim() ? 'var(--accent-ink)' : 'var(--ink-3)', background: draft.trim() ? 'var(--accent)' : 'var(--panel-2)', border: draft.trim() ? 'none' : '1px solid var(--line-2)', padding: '8px 14px', borderRadius: 9, cursor: draft.trim() ? 'pointer' : 'not-allowed' }}><Ic name="send" size={13} stroke={2.2} />{r.send}</button>
                          <button onClick={() => { setOpenReply(-1); setDraft(''); }} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--panel-2)', border: '1px solid var(--line-2)', padding: '8px 14px', borderRadius: 9 }}><Ic name="x" size={13} stroke={2.4} /></button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setOpenReply(i); setDraft(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', background: 'var(--panel-2)', border: '1px solid var(--line-2)', padding: '6px 12px', borderRadius: 9, cursor: 'pointer' }}><Ic name="msg" size={13} stroke={2} />{r.reply}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============ MARKETING ============ */
export function Marketing() {
  const { t, notify } = useCRM();
  const m = t.mkt;
  const segments = [
    { k: 'all', label: m.segAll, n: 1248 },
    { k: 'vip', label: m.segVip, n: 184 },
    { k: 'inactive', label: m.segInactive, n: 326 },
  ];
  const [seg, setSeg] = useState('all');
  const [msg, setMsg] = useState('');
  const reach = segments.find((s) => s.k === seg)!.n;
  const past: Array<[string, number, number, string]> = [[m.tpl[0], 1248, 71, '2d'], [m.tpl[1], 326, 58, '1w'], [m.tpl[2], 1180, 64, '2w']];
  const send = () => { notify(m.sent); setMsg(''); };

  return (
    <div className="fadein" style={{ padding: 28 }}>
      <div className="crm-dash-2col" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--blue-t)', color: 'var(--blue)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="send" size={19} stroke={2} /></span>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{m.broadcast}</div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>{m.audience}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {segments.map((sg) => {
              const on = seg === sg.k;
              return (
                <button key={sg.k} onClick={() => setSeg(sg.k)} style={{ flex: 1, minWidth: 120, textAlign: 'left', padding: '11px 13px', borderRadius: 12, cursor: 'pointer', background: on ? 'var(--accent-tint)' : 'var(--panel-2)', border: on ? '1.5px solid var(--accent-deep)' : '1.5px solid var(--line-2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{sg.label}</div>
                  <div className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{fmt(sg.n)} {m.reach}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>{m.templates}</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
            {m.tpl.map((tp: string, i: number) => (
              <button key={i} onClick={() => setMsg(tp.replace(/^[^ ]+ /, '') + '…')} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 999, background: 'var(--panel-2)', border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>{tp}</button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 8 }}>{m.msg}</div>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={m.msgPh} rows={4} style={{ width: '100%', border: '1.5px solid var(--line-2)', background: 'var(--panel-2)', color: 'var(--ink)', borderRadius: 12, padding: '12px 14px', fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'var(--font)', resize: 'vertical', lineHeight: 1.5 }} />
          <button onClick={send} disabled={!msg.trim()} style={{ marginTop: 16, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, fontSize: 15, padding: '13px', borderRadius: 12, background: msg.trim() ? 'var(--accent)' : 'var(--panel-2)', color: msg.trim() ? 'var(--accent-ink)' : 'var(--ink-3)', cursor: msg.trim() ? 'pointer' : 'not-allowed', boxShadow: msg.trim() ? '0 8px 18px -8px rgba(132,169,46,.6)' : 'none' }}>
            <Ic name="send" size={17} stroke={2.2} />{m.send} · {fmt(reach)}
          </button>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Panel>
            <div style={{ background: '#EAF3F8', borderRadius: 14, padding: 16, minHeight: 90 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#2AABEE', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="scissors" size={15} stroke={2} /></span>
                <div style={{ background: '#fff', borderRadius: 13, borderBottomLeftRadius: 4, padding: '10px 13px', boxShadow: '0 1px 2px rgba(15,40,60,.1)', maxWidth: '85%' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#2AABEE', marginBottom: 3 }}>{t.biz}</div>
                  <div style={{ fontSize: 13, color: '#0f2433', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg || m.msgPh}</div>
                </div>
              </div>
            </div>
          </Panel>
          <Panel pad={0}>
            <div style={{ padding: '16px 18px 8px', fontSize: 15, fontWeight: 800 }}>{m.recent}</div>
            {past.map((p, i) => (
              <div key={i} style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p[0]}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
                  <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ic name="send" size={12} stroke={2} />{fmt(p[1])}</span>
                  <span className="tnum" style={{ fontSize: 12, color: 'var(--accent-deep)', fontWeight: 700 }}>{p[2]}% {m.opened}</span>
                  <span className="tnum" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>{p[3]}</span>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============ AUTOMATIONS ============ */
export function Automations() {
  const { t, notify } = useCRM();
  const a = t.auto;
  const [rules, setRules] = useState<any[]>(() => a.rules.map((r: any) => ({ ...r })));
  useEffect(() => { setRules(a.rules.map((r: any) => ({ ...r }))); }, [t]);
  const toggle = (i: number) =>
    setRules((rs) => rs.map((r, j) => {
      if (j !== i) return r;
      const nv = !r.on;
      notify(nv ? a.toastOn : a.toastOff);
      return { ...r, on: nv };
    }));
  const activeCount = rules.filter((r) => r.on).length;
  const totalSent = rules.filter((r) => r.on).reduce((s, r) => s + r.sent, 0);
  const ruleIcon: Record<string, string> = { remind24: 'bell', remind2: 'clock', winback: 'loyalty', birthday: 'star', thanks: 'send', noshow: 'x' };

  return (
    <div className="fadein" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="crm-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
        <Panel pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--accent-tint)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="bell" size={20} stroke={2} /></span>
            <div><div className="tnum" style={{ fontSize: 22, fontWeight: 800 }}>{activeCount}/{rules.length}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{a.active}</div></div>
          </div>
        </Panel>
        <Panel pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--blue-t)', color: 'var(--blue)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name="send" size={19} stroke={2} /></span>
            <div><div className="tnum" style={{ fontSize: 22, fontWeight: 800 }}>{fmt(totalSent)}</div><div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{a.sent} · 30d</div></div>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.map((r, i) => (
          <Panel key={r.key} pad={0} style={{ opacity: r.on ? 1 : 0.72 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: r.on ? 'var(--accent-tint)' : 'var(--panel-2)', color: r.on ? 'var(--accent-deep)' : 'var(--ink-3)', display: 'grid', placeItems: 'center', flex: 'none' }}><Ic name={ruleIcon[r.key] || 'bell'} size={21} stroke={2} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800 }}>{r.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600, marginTop: 2, lineHeight: 1.45 }}>{r.desc}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Badge color="var(--ink-2)" tint="var(--panel-2)"><Ic name="clock" size={12} stroke={2} />{r.trig}</Badge>
                  <Badge color={r.ch === 'Telegram' ? 'var(--blue)' : 'var(--violet)'} tint={r.ch === 'Telegram' ? 'var(--blue-t)' : 'var(--violet-t)'}><Ic name={r.ch === 'Telegram' ? 'send' : 'phone'} size={12} stroke={2} />{r.ch}</Badge>
                  <Badge color="var(--ink-3)" tint="var(--panel-2)">{fmt(r.sent)} {a.sent}</Badge>
                </div>
              </div>
              <Switch on={r.on} onChange={() => toggle(i)} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
