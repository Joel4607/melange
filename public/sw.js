const CACHE_NAME = "melange-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  "/",
  "/app",
  "/offline.html",
  "/manifest.json",
  "/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET requests and cross-origin requests.
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  const accept = request.headers.get("accept");
  const isNavigation = request.mode === "navigate" || accept?.includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh page for future offline use.
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL);
          });
        }),
    );
    return;
  }

  // For static assets, serve from cache and fall back to network.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    }),
  );
});
