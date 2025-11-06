const CACHE_NAME = "sovereign-pwa-v1";
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  OFFLINE_URL,
  "/css/sv_base.css",
  "/css/sv_styled.css",
  "/css/sv_utility.css",
  "/js/sv_startup.js",
  "/assets/favicon.svg",
];

const debug = (...args) => {
  if (self.location.hostname === "localhost") {
    console.debug("[Sovereign SW]", ...args);
  }
};

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => debug("install cache error", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return null;
          })
        )
      )
      .catch((err) => debug("activate cleanup error", err))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", networkResponse.clone());
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(request, { ignoreSearch: true });
          if (cachedResponse) return cachedResponse;
          const offlinePage = await cache.match(OFFLINE_URL);
          return offlinePage || Response.error();
        }
      })()
    );
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch((error) => {
          debug("fetch error", error);
          return caches.match(OFFLINE_URL);
        });
    })
  );
});
