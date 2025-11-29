/* eslint-disable promise/catch-or-return */
/* eslint-disable promise/no-nesting */
/* eslint-disable n/no-unsupported-features/node-builtins */
// eslint-disable-next-line no-redeclare
/* global self, caches, fetch */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `sv-pwa-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `sv-pwa-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/favicon.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("sv-pwa-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request)
      .then((response) => {
        if (!response || !response.ok) return cached;
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => cached);
  });
}

function networkFirstForNavigation(event) {
  return fetch(event.request)
    .then((response) => {
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
      }
      return response;
    })
    .catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return caches.match("/offline.html");
    });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstForNavigation(event));
    return;
  }

  const cacheableDestinations = ["style", "script", "image", "font", "manifest"];
  const isCacheable =
    cacheableDestinations.includes(request.destination) || STATIC_ASSETS.includes(url.pathname);

  if (!isCacheable) return;

  event.respondWith(cacheFirst(request));
});
