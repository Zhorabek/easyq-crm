import { useEffect, useState } from 'react';
import { useCRM } from './i18n';
import { Modal } from './ui';
import { InstallArt } from './InstallArt';

/**
 * "Install the app" / "you already have the app" dialog, for a signed-in owner.
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
 *     silence, and a dialog they can never dismiss by acting on it is just noise.
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
 * No web API launches an installed PWA from a tab. The "installed" dialog therefore tells them
 * where it is; it cannot be a button that takes them there. Anything claiming otherwise would
 * be a button that does nothing.
 */

type Deferred = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = 'easyq.install.dismissed';
const INSTALLED_KEY = 'easyq.install.done';
/** Long enough not to nag, short enough that somebody who changes their mind is asked again. */
const DISMISS_DAYS = 30;
/**
 * Let the dashboard paint before covering it.
 *
 * A dialog that arrives with the first frame reads as something being wrong, and it lands before
 * anybody has seen what they signed in for. A beat later it reads as an offer.
 */
const OPEN_DELAY_MS = 1200;

/**
 * Phone or computer — for the COPY, not for capability.
 *
 * The first version had one string, and it said "runs from your phone's home screen" to an owner
 * sitting at a desktop. The install is just as real there; it lands in the taskbar or the Dock
 * and opens without browser chrome, which is a different promise and has to be worded as one.
 *
 * User agent first, because it is the thing that is actually being described. `pointer: coarse`
 * is the better capability signal but it is wrong for exactly the case that caused this bug: a
 * Windows laptop with a touchscreen is a computer.
 */
function isHandheld() {
  if (typeof navigator === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ hides behind a Mac user agent; touch points give it away.
  return /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}

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
  /** Gates the first paint of the dialog — see OPEN_DELAY_MS. */
  const [ready, setReady] = useState(false);
  /** Set when the protocol launch was attempted and we are demonstrably still here. */
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const timer = window.setTimeout(() => setReady(true), OPEN_DELAY_MS);

    const onBeforeInstall = (event: Event) => {
      // Chromium shows its own mini-infobar unless this is cancelled. Ours is a dialog with the
      // shop's own wording, so its bar would be a second, worse ask for the same thing.
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
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || !ready) return null;

  const os = platform();
  /**
   * What this dialog can honestly offer, in order of usefulness. `null` means stay quiet — the
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
    // The event is single-use; a second prompt() on it throws. Dropping it also closes the
    // dialog, which is right either way — accepted means installed, declined means asked.
    setDeferred(null);
    if (choice.outcome === 'accepted') setHidden(true);
    else dismiss();
  };

  /**
   * Launch the installed app from this tab.
   *
   * There is no API for "open my PWA", but there is a way round it: the manifest registers a
   * `web+easyq` protocol handler, and navigating to that scheme hands the URL to the installed
   * app. Chromium honours it on desktop and Android.
   *
   * It cannot be relied on. Safari and Firefox do not implement protocol handlers, and Chromium
   * only registers ours once the installed copy has picked up the new manifest — so an app
   * installed before today will ignore it until the browser refreshes that manifest.
   *
   * Hence the fallback rather than a bare `location.href`. If the page is still visible a beat
   * later, nothing launched, and the dialog says where to find the app by hand. A button that
   * silently does nothing is the thing worth avoiding here.
   */
  const openApp = () => {
    setOpenFailed(false);
    let launched = false;
    const onHide = () => { if (document.hidden) launched = true; };
    document.addEventListener('visibilitychange', onHide);
    try {
      window.location.href = 'web+easyq://open';
    } catch {
      launched = false;
    }
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      if (!launched && !document.hidden) setOpenFailed(true);
    }, 1400);
  };

  const handheld = isHandheld();

  // Which promise this device can actually keep. A desktop install is not a home screen.
  const sub =
    mode === 'installed'
      ? (handheld ? i.installedBody : i.installedBodyDesktop)
      : (handheld ? i.body : i.bodyDesktop);

  // Safari cannot be driven from script, so those two modes are STEPS rather than a button.
  const steps = mode === 'ios' ? i.iosBody : mode === 'macSafari' ? i.macBody : null;

  return (
    <Modal
      title={mode === 'installed' ? i.installedTitle : i.title}
      sub={sub}
      icon={handheld ? 'phone' : 'grid'}
      onClose={dismiss}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button
            onClick={dismiss}
            style={{
              minHeight: 40, padding: '0 16px', borderRadius: 10,
              border: '1px solid var(--line-2)', background: 'var(--panel-2)',
              color: 'var(--ink-2)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {mode === 'button' ? i.later : i.dismiss}
          </button>
          {/* Installed already: offer to hand this tab over to the app. */}
          {mode === 'installed' && (
            <button
              onClick={openApp}
              style={{
                minHeight: 40, padding: '0 18px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {i.open}
            </button>
          )}
          {/* Only Chromium gets an INSTALL button, because only Chromium can be asked from
              script. The Safari modes close on "got it" — there is nothing to press that helps. */}
          {mode === 'button' && (
            <button
              onClick={() => void install()}
              style={{
                minHeight: 40, padding: '0 18px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: 'var(--accent-ink)',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >
              {i.action}
            </button>
          )}
        </>
      }
    >
      {/* Capped and centred rather than full-bleed: this is a dialog somebody is deciding in, and
          artwork wider than the sentence above it turns the decision into a poster. */}
      <div className="eq-art eq-art--dialog" style={{ marginBottom: 4 }}>
        <InstallArt />
      </div>
      {openFailed && (
        <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 700, lineHeight: 1.5, color: 'var(--ink-3)', textAlign: 'center' }}>
          {i.openFailed}
        </p>
      )}
      {steps ? (
        <p style={{ margin: '4px 0 0', fontSize: 13.5, fontWeight: 600, lineHeight: 1.55, color: 'var(--ink-2)', textAlign: 'center' }}>
          {steps}
        </p>
      ) : null}
    </Modal>
  );
}
