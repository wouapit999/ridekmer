/* RideKmer service worker (ADR-034).
 *
 * Strategy:
 *  - precache the offline pages and the manifest at install;
 *  - `/_next/static/*` (content-hashed) and icons: cache-first;
 *  - HTML navigations: network-first with the offline page as fallback;
 *  - never cache `/api/*`, authentication, account, owner or admin routes, or anything with a
 *    `Set-Cookie`/`no-store` intent; private data must not sit in the browser cache.
 *
 * Bump CACHE_VERSION whenever the offline page or precache list changes.
 */
const CACHE_VERSION = "ridekmer-v1";
const PRECACHE = ["/fr/offline", "/en/offline", "/manifest.webmanifest", "/icons/icon.svg"];
const NEVER_CACHE = [/^\/api\//, /^\/(fr|en)\/(account|owner|admin|login|register|mfa|book)/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function localeFrom(pathname) {
  return pathname.startsWith("/en") ? "en" : "fr";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname))) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(`/${localeFrom(url.pathname)}/offline`)
          .then((page) => page || caches.match("/fr/offline"))
          .then(
            (page) =>
              page ||
              new Response("Hors ligne / Offline", {
                status: 503,
                headers: { "content-type": "text/plain; charset=utf-8" },
              }),
          ),
      ),
    );
  }
});
