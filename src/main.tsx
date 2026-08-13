import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import EmbedApp from './Embed';
import BookingApp from './booking/BookingApp';

// Three entry points off one bundle. There is no router library: the whole app has
// exactly these three states, and `/booking` is the only real path — everything else is
// the CRM, so a dependency would buy nothing.
//
// `/booking` is a separate PATH rather than the tenant root on purpose. `<slug>.easyq.uz/`
// stays the owner's CRM, so nobody's bookmark breaks and the Worker's tenant routing is
// untouched; clients get `<slug>.easyq.uz/booking`.
const route = (() => {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') return 'embed';
    // Tolerate a trailing slash so /booking and /booking/ behave the same.
    if (window.location.pathname.replace(/\/+$/, '') === '/booking') return 'booking';
  } catch {
    // A locked-down browser can throw on location access; the CRM is the safe default.
  }
  return 'crm';
})();

const Root = route === 'embed' ? EmbedApp : route === 'booking' ? BookingApp : App;

/**
 * The manifest is linked HERE rather than in index.html, because one HTML file serves three
 * different things.
 *
 * `/booking` and `?embed=1` are the same document as the CRM — the route above is what decides
 * which app renders. A static `<link rel="manifest">` in the head would therefore offer to
 * install the CRM from a customer's booking page, under the CRM's name and icon, starting at
 * `/` which that customer has no login for. Installability is a property of the app, and only
 * one of the three is an app somebody returns to.
 *
 * Chrome re-reads the manifest when the link element is inserted, so adding it before the first
 * render is enough for the install prompt to appear.
 */
if (route === 'crm') {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);

  /**
   * Registered from the CRM route only, for the same reason as the manifest — but note its SCOPE
   * is the whole origin, so on a tenant host it will also control that shop's `/booking` page
   * once an owner has opened their CRM there. That is safe (see the strategies in sw.js) and is
   * why nothing in that file may assume the visitor is an owner.
   *
   * After load, so registration never competes with the first render for bandwidth. The worker
   * only matters from the SECOND visit onward anyway; racing it against the paint of the first
   * one trades the thing the user is waiting for against a thing they cannot yet use.
   *
   * Failure is swallowed deliberately: an unsupported browser, a private window, or a blocked
   * registration should cost offline support and nothing else. The CRM works without it.
   */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('service worker registration failed; offline support is off:', error);
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
