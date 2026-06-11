import {
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
} from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';

/* ---------------- Logo ---------------- */
export function CRMLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none' }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#1A2406" strokeWidth="2.4" />
          <path d="M15.5 15.5 L20 20" stroke="#1A2406" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </span>
      <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.03em', color: '#fff' }}>
        easy<span style={{ color: 'var(--accent)' }}>Q</span>
      </span>
    </span>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, color, size = 38, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        background: color,
        color: 'rgba(20,15,8,.7)',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: size * 0.36,
        letterSpacing: '-.02em',
        boxShadow: ring ? `0 0 0 3px var(--panel), 0 0 0 4px ${color}` : 'none',
      }}
    >
      {initials}
    </span>
  );
}

/* ---------------- Badge ---------------- */
export function Badge({ children, color = 'var(--ink-3)', tint = 'var(--panel-2)', dot }: { children: ReactNode; color?: string; tint?: string; dot?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color, background: tint, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}
      {children}
    </span>
  );
}

/* ---------------- Panel ---------------- */
export function Panel({ children, style, pad = 20, className = '' }: { children: ReactNode; style?: CSSProperties; pad?: number; className?: string }) {
  return (
    <div className={className} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', padding: pad, ...style }}>
      {children}
    </div>
  );
}

/* ---------------- BarChart ---------------- */
export function BarChart({ data, labels, height = 150, highlight = -1, color = 'var(--accent)' }: { data: number[]; labels: string[]; height?: number; highlight?: number; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', maxWidth: 38, height: Math.max(4, Math.round((v / max) * (height - 28))) + 'px', background: i === highlight ? 'var(--accent-deep)' : color, opacity: i === highlight ? 1 : 0.85, borderRadius: 7, transition: 'height .4s ease' }} />
          <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 700 }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Donut ---------------- */
export function Donut({ segments, size = 132, thickness = 18 }: { segments: Array<{ v: number; color: string }>; size?: number; thickness?: number }) {
  const total = segments.reduce((s, x) => s + x.v, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((s, i) => {
          const len = (s.v / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="round" />;
          off += len;
          return el;
        })}
      </g>
    </svg>
  );
}

/* ---------------- Switch ---------------- */
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 46, height: 27, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--line-2)', position: 'relative', transition: 'background .2s', flex: 'none' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
    </button>
  );
}

/* ---------------- Status / via badges ---------------- */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useCRM();
  const map: Record<string, [string, string]> = {
    confirmed: ['var(--accent-deep)', 'var(--accent-tint)'],
    pending: ['var(--amber)', 'var(--amber-t)'],
    done: ['var(--blue)', 'var(--blue-t)'],
    cancelled: ['var(--rose)', 'var(--rose-t)'],
  };
  const [c, tint] = map[status] || map.pending;
  return <Badge color={c} tint={tint} dot>{t.status[status] ?? status}</Badge>;
}

export function ViaBadge({ via }: { via: string }) {
  const { t } = useCRM();
  const icon = ({ telegram: 'send', web: 'grid', walkin: 'user', phone: 'phone' } as Record<string, string>)[via] || 'send';
  const col = via === 'telegram' ? 'var(--blue)' : 'var(--ink-3)';
  return (
    <span title={t.via[via]} style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--panel-2)', color: col, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <Ic name={icon} size={14} stroke={2} />
    </span>
  );
}

/* ---------------- Form fields ---------------- */
export const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--line-2)',
  background: 'var(--panel-2)',
  color: 'var(--ink)',
  borderRadius: 10,
  padding: '11px 13px',
  fontSize: 14,
  fontWeight: 600,
  outline: 'none',
  fontFamily: 'var(--font)',
};

export function Field({ label, children, half }: { label: ReactNode; children: ReactNode; half?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: half ? 1 : 'auto', minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--accent-deep)';
        e.target.style.background = 'var(--panel)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'var(--line-2)';
        e.target.style.background = 'var(--panel-2)';
      }}
    />
  );
}

export function SelectInput({ value, onChange, children }: { value?: string | number; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={onChange} style={{ ...inputStyle, appearance: 'none', paddingRight: 34, cursor: 'pointer' }}>
        {children}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }}>
        <Ic name="chevD" size={16} />
      </span>
    </div>
  );
}

export function Segmented({ options, value, onChange }: { options: Array<{ v: string; l: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            style={{ flex: 1, minWidth: 64, fontSize: 13, fontWeight: 700, padding: '9px 10px', borderRadius: 9, whiteSpace: 'nowrap', color: on ? 'var(--accent-ink)' : 'var(--ink-2)', background: on ? 'var(--accent)' : 'var(--panel-2)', border: on ? '1px solid var(--accent)' : '1px solid var(--line-2)' }}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Modal shell ---------------- */
export function Modal({ title, sub, icon, onClose, children, footer }: { title: string; sub?: string; icon: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="crm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="crm-modal" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '22px 24px 16px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-tint)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Ic name={icon} size={22} stroke={2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</div>
            {sub && <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 1 }}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Ic name="x" size={17} />
          </button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'auto' }}>{children}</div>
        {footer && <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--line)', background: 'var(--panel-2)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function FooterBtns({ onClose, submitLabel, onSubmit, disabled }: { onClose: () => void; submitLabel: string; onSubmit: () => void; disabled?: boolean }) {
  const { m } = useCRM();
  return (
    <>
      <button onClick={onClose} style={{ flex: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--panel)', border: '1px solid var(--line-2)' }}>
        {m.cancel}
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        style={{ flex: 1, padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 800, color: disabled ? 'var(--ink-3)' : 'var(--accent-ink)', background: disabled ? 'var(--panel-2)' : 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, boxShadow: disabled ? 'none' : '0 6px 16px -8px rgba(132,169,46,.6)', cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        <Ic name="check" size={17} stroke={2.4} />
        {submitLabel}
      </button>
    </>
  );
}

/* ---------------- Toast ---------------- */
export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="crm-toast">
      <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', flex: 'none' }}>
        <Ic name="check" size={15} stroke={3} />
      </span>
      {msg}
    </div>
  );
}

/* ---------------- Settings helpers ---------------- */
export const setInput: CSSProperties = { border: '1.5px solid var(--line-2)', background: 'var(--panel-2)', color: 'var(--ink)', borderRadius: 10, padding: '11px 13px', fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: 'var(--font)', width: '100%' };

export function SetHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 16.5, fontWeight: 800 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function SetField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{label}</span>
      {children}
    </label>
  );
}

export function SetSelect({ value, onChange, children }: { value?: string | number; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={onChange} style={{ ...setInput, appearance: 'none', paddingRight: 34, cursor: 'pointer' }}>
        {children}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }}>
        <Ic name="chevD" size={16} />
      </span>
    </div>
  );
}

export function SetRow({ title, desc, children, first }: { title: string; desc?: string; children: ReactNode; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 0', borderTop: first ? 'none' : '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export const iconBtn: CSSProperties = { width: 38, height: 38, borderRadius: 11, background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center' };
