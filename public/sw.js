/*
 * EasyQ service worker.
 *
 * Registered only from the CRM route (see main.tsx), but its scope is the whole origin, so on a
 * tenant host it also controls that shop's `/booking` page. That is fine and deliberate — the
 * strategies below are safe for both — but it is why nothing here may assume it is serving an
 * owner rather than a customer.
 *
 * ## Two rules, and everything else follows from them
 *
 * 1. NEVER CACHE `/api/*`. This CRM shows a calendar. A cached response means an owner reading
 *    bookings that were cancelled an hour ago, or a specialist who was deleted, with no way to
 *    tell that is what they are looking at. Wrong data presented confidently is worse than an
 *    error, and the app already has error states. API requests go to the network and are allowed
 *    to fail.
 *
 * 2. NEVER CACHE-FIRST THE HTML. Vite emits content-hashed bundles — `index-DAtzt9o7.js` — and
 *    a deploy replaces them with new names. Serving a stale `index.html` therefore points the
 *    browser at a filename that no longer exists, and the app is a white screen until somebody
 *    clears storage. Since deploys here are frequent, this is not a theoretical risk. HTML is
 *    network-first, cache-fallback: online you always get the current shell, offline you get the
 *    last one that worked.
 *
 * Hashed assets ARE cache-first, because a content hash makes them immutable — `index-ABC.js`
 * is always the same bytes, so a cache hit cannot be stale by definition.
 *
 * ## No skipWaiting
 *
 * A new worker waits for existing tabs to close rather than taking over mid-session. Taking over
 * immediately would let a page that loaded the old bundle request a lazily-loaded chunk that the
 * new deploy has already deleted. `clients.claim()` is still called, which matters only on the
 * very first install, when there is no previous worker to displace.
 */

const VERSION = "easyq-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

/**
 * The shell is `/` alone.
 *
 * Not the hashed bundles: their names change every build, so a hand-written list here would be
 * wrong the moment it shipped. They land in the asset cache on first use instead, which costs
 * one online visit before the app works offline — the honest trade for never guessing a filename.
 *
 * `/` is also the right entry for `/booking`: it is the same document, and main.tsx picks the app
 * from `location.pathname` after it loads.
 */
const SHELL_URLS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from a previous VERSION. Without this each deploy leaves its predecessor's
      // bytes on the device forever.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

/** Immutable by construction: Vite content-hashes these, and the icons are generated artefacts. */
function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Anything that is not a plain GET is a write. Caching one would be a correctness bug; replaying
  // one would be worse.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (fonts, Telegram) is left entirely alone — not our storage to manage, and the
  // browser's own HTTP cache already handles it.
  if (url.origin !== self.location.origin) return;

  // Rule 1. Untouched, so the app's own error handling decides what an offline CRM looks like.
  if (url.pathname.startsWith("/api/")) return;

  // Rule 2. Network first; fall back to the last shell that loaded.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Only a real success is worth keeping. Caching a 500 would pin an error page in place
          // until the next successful load.
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put("/", response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match("/", { cacheName: SHELL_CACHE });
          if (cached) return cached;
          throw new Error("offline and no cached shell");
        }
      })()
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: ASSET_CACHE });
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })()
    );
  }
});
