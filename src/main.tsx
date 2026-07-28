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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
