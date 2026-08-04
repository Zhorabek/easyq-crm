import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';

/**
 * The first-run guided tour.
 *
 * ## Steps are keyed, not indexed
 *
 * The old version kept the targets in one array here and the copy in another array in i18n,
 * paired by POSITION. Adding a step to one and not the other rendered a blank card with working
 * buttons — no crash, no warning, just an empty box in front of a new customer. Now each step
 * carries its own key and the copy is looked up by that key, so the two cannot drift out of
 * alignment, and a step whose copy is missing is dropped rather than drawn empty.
 *
 * ## The tour drives the CRM
 *
 * Each step that describes a screen SWITCHES to it. Previously the tour lit up a sidebar item
 * while the content behind it stayed on whatever screen you happened to be on — so "Services:
 * add your prices" was narrated over the dashboard. Being shown the screen is the entire value
 * of a tour; without that it is a slideshow that happens to be on top of an app.
 *
 * ## Role-aware
 *
 * A specialist has no Staff, Services or Branding in their sidebar (ROLE_SCREENS in App.tsx).
 * Steps whose screen they cannot open are dropped, rather than pointing at a nav item that is
 * not there — which is what produced a centred card describing a screen they would never find.
 */

type TourStep = {
  /** Looks the copy up in `t.tour.steps`. */
  key: string;
  /** `data-tour` anchor to spotlight. `null` centres the card with no spotlight. */
  target: string | null;
  /** Screen to switch to, and the permission gate: no access, no step. */
  screen?: string;
};

const TOUR_STEPS: TourStep[] = [
  { key: 'welcome', target: null },
  { key: 'business', target: 'biz-header' },
  { key: 'calendar', target: 'nav-calendar', screen: 'calendar' },
  { key: 'services', target: 'nav-services', screen: 'services' },
  { key: 'staff', target: 'nav-staff', screen: 'staff' },
  { key: 'branding', target: 'nav-branding', screen: 'branding' },
  { key: 'settings', target: 'nav-settings', screen: 'settings' },
  { key: 'topbar', target: 'topbar' },
  { key: 'finish', target: null },
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tour({
  open,
  onClose,
  setActive,
  storageKey,
}: {
  open: boolean;
  onClose: () => void;
  setActive: (s: string) => void;
  /** Per-business, so two owners sharing a browser each get their own first run. */
  storageKey: string;
}) {
  const { t, lang, allowed } = useCRM();
  const tour = t.tour;

  // Only steps this role can actually reach, and only those with copy in the current language.
  const steps = useMemo(
    () =>
      TOUR_STEPS.filter(
        (s) => (!s.screen || !allowed || allowed.includes(s.screen)) && Boolean(tour.steps?.[s.key])
      ),
    [allowed, tour]
  );
  const total = steps.length;

  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const current = steps[Math.min(step, total - 1)];
  const isLast = step >= total - 1;

  const finish = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {}
    onClose();
  }, [onClose, storageKey]);

  const next = useCallback(() => {
    if (isLast) {
      // Land them on Services: the tour ends by asking for their first service, and dropping
      // them back on an empty dashboard would strand that instruction.
      if (!allowed || allowed.includes('services')) setActive('services');
      finish();
    } else {
      setStep((s) => Math.min(s + 1, total - 1));
    }
  }, [allowed, finish, isLast, setActive, total]);

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // Restart at the first step whenever the tour opens, and remember where focus came from so
  // the help button gets it back on close.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    return () => returnFocusTo.current?.focus?.();
  }, [open]);

  // Show the screen being described. Without this the tour narrates screens you cannot see.
  useEffect(() => {
    if (!open || !current?.screen) return;
    setActive(current.screen);
  }, [open, current, setActive]);

  // Measure the target, scrolling it into view first — the body is scroll-locked while the tour
  // runs, so a target below the fold would otherwise get a spotlight nobody can see.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const measure = () => {
      const sel = current?.target;
      if (!sel) return setRect(null);
      const el = document.querySelector(`[data-tour="${sel}"]`) as HTMLElement | null;
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return setRect(null);
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const start = () => {
      const sel = current?.target;
      const el = sel ? (document.querySelector(`[data-tour="${sel}"]`) as HTMLElement | null) : null;
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      // Two frames: one for the screen switch above to commit, one to measure the settled layout.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(measure);
      });
    };
    start();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, current, lang]);

  // Place the card beside the target, or centre it.
  useLayoutEffect(() => {
    if (!open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = cardRef.current?.offsetWidth ?? 320;
    const ch = cardRef.current?.offsetHeight ?? 180;
    const clampL = (x: number) => Math.min(Math.max(12, x), Math.max(12, vw - cw - 12));
    const clampT = (y: number) => Math.min(Math.max(12, y), Math.max(12, vh - ch - 12));
    if (!rect) {
      setPos({ top: Math.max(12, (vh - ch) / 2), left: Math.max(12, (vw - cw) / 2) });
      return;
    }
    const pad = 14;
    if (rect.left < vw * 0.45 && rect.left + rect.width + cw + pad + 12 < vw) {
      setPos({ top: clampT(rect.top), left: rect.left + rect.width + pad }); // right of the sidebar
    } else if (rect.top + rect.height + ch + pad + 12 < vh) {
      setPos({ top: rect.top + rect.height + pad, left: clampL(rect.left) }); // below
    } else {
      setPos({ top: clampT(rect.top - ch - pad), left: clampL(rect.left) }); // above
    }
  }, [rect, open, step, lang]);

  // Move focus into the card so the keyboard and screen readers follow the tour rather than the
  // page behind it.
  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
  }, [open, step]);

  // Keys and scroll lock.
  //
  // Enter is deliberately NOT bound: with focus inside the card it is already the activation key
  // for whichever button is focused, and handling it here too made one press both advance the
  // step and click Skip.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Tab') {
        // Keep focus inside the card; behind it is a scroll-locked page they cannot act on.
        const focusable = cardRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, back, next, finish]);

  if (!open || total === 0 || !current) return null;

  const st = tour.steps[current.key] as { title: string; body: string };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {/* Click blocker. Transparent when a spotlight is up, because the ring's giant box-shadow
          is what dims everything in that case. */}
      <div style={{ position: 'absolute', inset: 0, background: rect ? 'transparent' : 'rgba(8,12,20,.6)' }} />

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

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
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
          outline: 'none',
          transition: 'top .2s ease, left .2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-deep)', background: 'var(--accent-tint)', padding: '3px 9px', borderRadius: 999 }}>
            {String(tour.stepOf).replace('{n}', String(step + 1)).replace('{total}', String(total))}
          </span>
          <button onClick={finish} aria-label={tour.close} title={tour.close} style={{ color: 'var(--ink-3)', display: 'grid', placeItems: 'center' }}>
            <Ic name="x" size={17} />
          </button>
        </div>
        <div id="tour-title" style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--ink)' }}>{st.title}</div>
        <div id="tour-body" style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>{st.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={finish} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', padding: '9px 6px' }}>{tour.skip}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={back} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', background: 'var(--panel-2)', border: '1px solid var(--line-2)', padding: '9px 14px', borderRadius: 10 }}>
                {tour.back}
              </button>
            )}
            <button
              onClick={next}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--accent-ink)', background: 'var(--accent)', padding: '9px 16px', borderRadius: 10, boxShadow: '0 6px 16px -8px color-mix(in srgb, var(--accent) 60%, transparent)' }}
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
