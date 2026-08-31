/* Core Chord Formula Toolkit - offline service worker */
/* NOTE: bump CACHE on every deploy that changes a precached asset. */
const CACHE = "ccf-toolkit-v6";

/* App shell. index.html is network-first (see below) so deploys reach
   returning users immediately; these are the offline fallbacks. */
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

/* Hosts we are allowed to cache. Everything else (Supabase auth + REST above
   all) must always hit the network: caching an API or auth response pins a
   stale session or a 401 body into the cache permanently. */
const CACHEABLE_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

/* The Supabase client bundle: cached for offline use, but revalidated on every
   online load so a returning user is never pinned to an outdated SDK. */
const SDK_HOST = "cdn.jsdelivr.net";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putInCache = (req, res) => {
  if (!res || !res.ok || res.type === "opaque") return res;
  const copy = res.clone();
  caches.open(CACHE).then((c) => { try { c.put(req, copy); } catch (_) {} });
  return res;
};

/* Fresh when online, cached when not. Used for the app shell and the SDK so a
   deploy or an SDK upgrade is picked up on the next load instead of never. */
const networkFirst = (req) =>
  fetch(req).then((res) => putInCache(req, res))
    .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")));

const cacheFirst = (req) =>
  caches.match(req).then((cached) => cached || fetch(req).then((res) => putInCache(req, res)));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const sameOrigin = url.origin === self.location.origin;

  /* Never touch anything else cross-origin - Supabase auth/REST included. */
  if (!sameOrigin && url.hostname !== SDK_HOST && CACHEABLE_HOSTS.indexOf(url.hostname) < 0) return;

  /* Navigations and the app shell: always try the network first, so a fix
     deployed to index.html actually reaches people who already have the PWA. */
  if (req.mode === "navigate" || (sameOrigin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(networkFirst(req));
    return;
  }

  if (url.hostname === SDK_HOST) { e.respondWith(networkFirst(req)); return; }

  e.respondWith(cacheFirst(req));
});
