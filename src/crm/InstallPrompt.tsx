import { useEffect, useState } from 'react';
import { Ic } from './icons';
import { useCRM } from './i18n';

/**
 * "Install the app" / "you already have the app" banner, for a signed-in owner.
 *
 * ## What the platforms actually allow
 *
 * This is not one feature, it is four, because the web platform disagrees with itself:
 *
 *   Chromium (Android, Windows, macOS, ChromeOS)
 *     Fires `beforeinstallprompt`. We keep the event and show a real Install button that opens
 *     the browser's own dialog. The only case where one tap installs.
 *
 *   iOS / iPadOS Safari
 *     No `beforeinstallprompt`, and no way to trigger the sheet from script — Apple has never
 *     shipped it. All we can do is say where the button is: Share, then Add to Home Screen.
 *
 *   macOS Safari 17+
 *     Same absence, different menu: File, then Add to Dock.
 *
 *   Firefox desktop
 *     Cannot install a PWA at all. Shows NOTHING. Advice somebody cannot follow is worse than
 *     silence, and a banner they can never dismiss by acting on it is just noise.
 *
 * ## "Already installed but browsing" cannot be detected reliably
 *
 * There is no API that answers it everywhere. `getInstalledRelatedApps()` is Chromium-only, and
 * a display-mode query tells you how THIS tab is running, not whether an installed copy exists.
 * So the honest signal is our own memory: when `appinstalled` fires we write it down, and if we
 * later find ourselves in a browser tab on a device that told us it installed, we say so.
 *
 * That misses somebody who installed on another device, and it always will. It is a nudge, not
 * a fact, so it is worded as one.
 *
 * ## And we cannot open it for them
 *
 * No web API launches an installed PWA from a tab. The "installed" banner therefore tells them
 * where it is; it cannot be a button that takes them there. Anything claiming otherwise would
 * be a button that does nothing.
 */

type Deferred = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = 'easyq.install.dismissed';
const INSTALLED_KEY = 'easyq.install.done';
/** Long enough not to nag, short enough that somebody who changes their mind is asked again. */
const DISMISS_DAYS = 30;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    // iOS Safari's own flag; it never implemented display-mode for home-screen apps.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function platform() {
  if (typeof navigator === 'undefined') return 'other' as const;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as a Mac; touch points are what still give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios' as const;
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS|Android/.test(ua);
  if (safari) return 'macSafari' as const;
  return 'other' as const;
}

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const { t } = useCRM();
  const i = t.install;
  const [deferred, setDeferred] = useState<Deferred | null>(null);
  const [knownInstalled, setKnownInstalled] = useState(false);
  const [hidden, setHidden] = useState(() => isStandalone() || dismissedRecently());

  useEffect(() => {
    if (isStandalone()) return;

    const onBeforeInstall = (event: Event) => {
      // Chromium shows its own mini-infobar unless this is cancelled, and we want the prompt to
      // appear where the rest of the CRM's messaging is, not over it.
      event.preventDefault();
      setDeferred(event as Deferred);
    };
    const onInstalled = () => {
      try { localStorage.setItem(INSTALLED_KEY, String(Date.now())); } catch { /* private mode */ }
      // Nothing more to ask for on this device right now: they are still in the tab that did it.
      setHidden(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    try {
      if (localStorage.getItem(INSTALLED_KEY)) setKnownInstalled(true);
    } catch { /* private mode */ }

    // Chromium's own answer, where it exists, beats our remembered one.
    const related = (navigator as unknown as {
      getInstalledRelatedApps?: () => Promise<unknown[]>;
    }).getInstalledRelatedApps;
    if (related) {
      related.call(navigator).then((apps) => { if (apps.length > 0) setKnownInstalled(true); }).catch(() => undefined);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden) return null;

  const os = platform();
  /**
   * What this banner can honestly offer, in order of usefulness. `null` means stay quiet — the
   * case that matters is Firefox desktop, where installing is impossible and any advice would be
   * a dead end.
   */
  const mode: 'button' | 'ios' | 'macSafari' | 'installed' | null =
    deferred ? 'button'
    : knownInstalled ? 'installed'
    : os === 'ios' ? 'ios'
    : os === 'macSafari' ? 'macSafari'
    : null;

  if (!mode) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    // The event is single-use; a second prompt() on it throws. Dropping it also removes the
    // button, which is right either way — accepted means installed, declined means asked.
    setDeferred(null);
    if (choice.outcome === 'accepted') setHidden(true);
    else dismiss();
  };

  const text =
    mode === 'button' ? i.body
    : mode === 'ios' ? i.iosBody
    : mode === 'macSafari' ? i.macBody
    : i.installedBody;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', background: 'var(--accent-tint)', color: 'var(--accent-deep)',
        fontSize: 13, fontWeight: 700, borderBottom: '1px solid var(--line)',
      }}
    >
      <Ic name="phone" size={16} stroke={2.2} />
      <span style={{ fontWeight: 800 }}>{mode === 'installed' ? i.installedTitle : i.title}</span>
      <span style={{ fontWeight: 600, opacity: 0.9 }}>{text}</span>
      <span style={{ flex: 1 }} />
      {mode === 'button' && (
        <button
          onClick={() => void install()}
          style={{
            minHeight: 32, padding: '0 14px', borderRadius: 9, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
          }}
        >
          {i.action}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label={i.dismiss}
        title={i.dismiss}
        style={{
          minHeight: 32, minWidth: 32, display: 'grid', placeItems: 'center',
          borderRadius: 9, border: 'none', background: 'transparent',
          color: 'var(--accent-deep)', cursor: 'pointer',
        }}
      >
        <Ic name="x" size={15} stroke={2.4} />
      </button>
    </div>
  );
}
