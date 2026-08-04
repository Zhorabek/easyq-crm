import { useState } from 'react';
import { useCRM } from './i18n';
import { Ic } from './icons';

/**
 * The manual, inside the product.
 *
 * ## Why there are no screenshots
 *
 * Screenshots of your own UI are a liability. The booking link moved screens, Settings lost two
 * sections, the light/dark toggle went away and the tour was rebuilt — all in one working day.
 * Every screenshot taken before that morning would now be showing customers a product that does
 * not exist, and nothing would have failed to warn us: an out-of-date picture renders perfectly.
 *
 * So each topic carries a BUTTON to the screen it describes instead. The reader looks at the
 * live thing, one click away, and it is right by construction. `scripts/help-check.cjs` asserts
 * that every one of those buttons points at a screen that exists and that the reader can open.
 *
 * ## Role-aware, for the same reason the tour is
 *
 * A specialist reading "add your services" is being told to use a screen with no nav item. Every
 * topic declares the screen it is about, and topics whose screen the reader cannot open are not
 * rendered. Topics with no screen — the Telegram bots, the subscription — are for everyone.
 */

type Topic = {
  key: string;
  icon: string;
  /** The screen this explains. Undefined means it is not about one screen. */
  screen?: string;
  /** Owner-only regardless of screen access — currently just billing. */
  ownerOnly?: boolean;
};

const TOPICS: Topic[] = [
  { key: 'start', icon: 'check', screen: 'services' },
  { key: 'services', icon: 'scissors', screen: 'services' },
  { key: 'staff', icon: 'staff', screen: 'staff' },
  { key: 'calendar', icon: 'calendar', screen: 'calendar' },
  { key: 'customers', icon: 'customers', screen: 'customers' },
  { key: 'branding', icon: 'branding', screen: 'branding' },
  { key: 'link', icon: 'grid' },
  { key: 'bookingOrder', icon: 'filter', screen: 'branding' },
  { key: 'money', icon: 'wallet', screen: 'finance' },
  { key: 'account', icon: 'shield', screen: 'settings' },
  { key: 'bots', icon: 'send' },
  { key: 'billing', icon: 'clock', ownerOnly: true },
];

const MANAGER_URL = 'https://t.me/easyq_manager';

function TopicCard({
  topic,
  open,
  onToggle,
  onGo,
}: {
  topic: Topic;
  open: boolean;
  onToggle: () => void;
  onGo?: () => void;
}) {
  const { t } = useCRM();
  const copy = t.help.topics[topic.key] as { title: string; body: string; steps: string[] };

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 14,
        background: 'var(--panel)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '15px 16px',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 34, height: 34, borderRadius: 10, flex: 'none', display: 'grid', placeItems: 'center',
            background: 'var(--accent-tint)', color: 'var(--accent-deep)',
          }}
        >
          <Ic name={topic.icon} size={17} stroke={2} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{copy.title}</span>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 2 }}>
            {copy.body}
          </span>
        </span>
        <span style={{ flex: 'none', color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }}>
          <Ic name="chevR" size={17} />
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px 62px' }}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {copy.steps.map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  className="tnum"
                  style={{
                    flex: 'none', width: 20, height: 20, borderRadius: 999, marginTop: 1,
                    display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800,
                    background: 'var(--panel-2)', color: 'var(--ink-2)', border: '1px solid var(--line-2)',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', lineHeight: 1.55 }}>{step}</span>
              </li>
            ))}
          </ol>

          {/* Straight to the real screen rather than a picture of it. */}
          {onGo && (
            <button
              onClick={onGo}
              style={{
                marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 13, fontWeight: 800, padding: '9px 15px', borderRadius: 10,
                background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer',
              }}
            >
              {t.help.openScreen}
              <Ic name="chevR" size={15} stroke={2.4} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Help() {
  const { t, allowed, role, startTour, setActive } = useCRM();
  const [open, setOpen] = useState<string | null>('start');

  const topics = TOPICS.filter((topic) => {
    if (topic.ownerOnly && role !== 'owner') return false;
    if (topic.screen && allowed && !allowed.includes(topic.screen)) return false;
    return Boolean(t.help.topics[topic.key]);
  });

  return (
    <div className="fadein" style={{ padding: 28, maxWidth: 860 }}>
      {/* The tour and the manual are the same content in two shapes: the tour shows you where
          things are, this explains what to do once you are there. Offering the tour from here
          is why the help button in the topbar is not the only way back to it. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          padding: '16px 18px', borderRadius: 14, marginBottom: 18,
          background: 'var(--accent-tint)', border: '1px solid var(--accent)',
        }}
      >
        <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          <Ic name="help" size={19} stroke={2.2} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{t.help.tourTitle}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', marginTop: 2 }}>{t.help.tourSub}</div>
        </div>
        <button
          onClick={startTour}
          style={{
            flex: 'none', fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 10,
            background: 'var(--accent)', color: 'var(--accent-ink)', cursor: 'pointer',
          }}
        >
          {t.help.startTour}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {topics.map((topic) => (
          <TopicCard
            key={topic.key}
            topic={topic}
            open={open === topic.key}
            onToggle={() => setOpen((current) => (current === topic.key ? null : topic.key))}
            onGo={topic.screen ? () => setActive(topic.screen!) : undefined}
          />
        ))}
      </div>

      {/* A manual that cannot answer the question has to say who can. */}
      <div
        style={{
          marginTop: 18, padding: '16px 18px', borderRadius: 14,
          border: '1px solid var(--line)', background: 'var(--panel)',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}
      >
        <span style={{ width: 38, height: 38, borderRadius: 11, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--panel-2)', color: 'var(--ink-2)' }}>
          <Ic name="send" size={19} stroke={2} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}>{t.help.askTitle}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', marginTop: 2 }}>{t.help.askSub}</div>
        </div>
        <a
          href={MANAGER_URL}
          target="_blank"
          rel="noopener"
          style={{
            flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 10,
            background: 'var(--ink)', color: 'var(--panel)',
          }}
        >
          {t.help.askAction}
        </a>
      </div>
    </div>
  );
}
