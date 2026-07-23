import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';

// Ordered to match t.tour.steps. `null` = a centered card (no spotlight).
const STEP_TARGETS: Array<string | null> = [
  null, // welcome
  'biz-header',
  'nav-calendar',
  'nav-staff',
  'nav-services',
  'nav-settings',
  'topbar',
  null, // finish
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tour({ open, onClose, setActive }: { open: boolean; onClose: () => void; setActive: (s: string) => void }) {
  const { t, lang } = useCRM();
  const tour = t.tour;
  const total = STEP_TARGETS.length;

  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const isLast = step === total - 1;
  const finish = () => {
    try {
      localStorage.setItem('easyq_crm_tour_done', '1');
    } catch {}
    onClose();
  };
  const skip = finish;
  const next = () => {
    if (isLast) {
      setActive('services');
      finish();
    } else {
      setStep((s) => Math.min(s + 1, total - 1));
    }
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  // restart at the first step whenever the tour opens
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // measure the current target (falls back to a centered card if it isn't on screen)
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const sel = STEP_TARGETS[step];
      if (!sel) return setRect(null);
      const el = document.querySelector(`[data-tour="${sel}"]`) as HTMLElement | null;
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return setRect(null);
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const id = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step, lang]);

  // place the tooltip card beside the target (or centered)
  useLayoutEffect(() => {
    if (!open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = cardRef.current?.offsetWidth ?? 320;
    const ch = cardRef.current?.offsetHeight ?? 180;
    const clampL = (x: number) => Math.min(Math.max(12, x), vw - cw - 12);
    const clampT = (y: number) => Math.min(Math.max(12, y), vh - ch - 12);
    if (!rect) {
      setPos({ top: Math.max(12, (vh - ch) / 2), left: Math.max(12, (vw - cw) / 2) });
      return;
    }
    const pad = 14;
    if (rect.left < vw * 0.45 && rect.left + rect.width + cw + pad + 12 < vw) {
      // to the right (sidebar targets)
      setPos({ top: clampT(rect.top), left: rect.left + rect.width + pad });
    } else if (rect.top + rect.height + ch + pad + 12 < vh) {
      // below
      setPos({ top: rect.top + rect.height + pad, left: clampL(rect.left) });
    } else {
      // above
      setPos({ top: clampT(rect.top - ch - pad), left: clampL(rect.left) });
    }
  }, [rect, open, step, lang]);

  // keyboard + scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, isLast]);

  if (!open) return null;

  const st = (tour.steps && tour.steps[step]) || { title: '', body: '' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {/* click-blocking layer; dims fully on centered steps (spotlight ring dims the rest) */}
      <div style={{ position: 'absolute', inset: 0, background: rect ? 'transparent' : 'rgba(8,12,20,.6)' }} />

      {/* spotlight ring */}
      {rect && (
        <div
          style={{
            position: 'absolute',
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(8,12,20,.6)',
            border: '2px solid var(--accent)',
            pointerEvents: 'none',
            transition: 'top .2s ease, left .2s ease, width .2s ease, height .2s ease',
          }}
        />
      )}

      {/* tooltip card */}
      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          top: pos.top,
          left: pos.left,
          width: 320,
          maxWidth: 'calc(100vw - 24px)',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          padding: 18,
          transition: 'top .2s ease, left .2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-deep)', background: 'var(--accent-tint)', padding: '3px 9px', borderRadius: 999 }}>
            {String(tour.stepOf).replace('{n}', String(step + 1)).replace('{total}', String(total))}
          </span>
          <button onClick={skip} aria-label="Close" style={{ color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}>
            <Ic name="x" size={17} />
          </button>
        </div>
        <div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>{st.title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>{st.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={skip} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', padding: '9px 6px' }}>{tour.skip}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={back} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', background: 'var(--panel-2)', border: '1px solid var(--line-2)', padding: '9px 14px', borderRadius: 10 }}>
                {tour.back}
              </button>
            )}
            <button
              onClick={next}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--accent-ink)', background: 'var(--accent)', padding: '9px 16px', borderRadius: 10, boxShadow: '0 6px 16px -8px rgba(132,169,46,.6)' }}
            >
              {isLast ? tour.done : tour.next}
              {!isLast && <Ic name="chevR" size={15} stroke={2.4} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
