import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import EmbedApp from './Embed';

const isEmbed = (() => {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
})();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isEmbed ? <EmbedApp /> : <App />}</React.StrictMode>,
);
