const CACHE_NAME = "melange-v2";
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  "/",
  "/app",
  "/offline.html",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/maskable-icon.png",
  "/apple-touch-icon.png",
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
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

function isApiOrDataRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/auth/callback")
  );
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image/");
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.status === 200) {
        const clone = response.clone();
        cache.put(request, clone);
      }
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(request.url);

  // Never cache API routes, auth callbacks, Webpack HMR, or Next data payloads.
  if (isApiOrDataRequest(url)) {
    return;
  }

  // Navigation / page requests: network first, then cache, then fallback.
  const accept = request.headers.get("accept");
  const isNavigation = request.mode === "navigate" || accept?.includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached ||
                caches.match("/app").then((app) => app || caches.match(OFFLINE_URL)),
            ),
        ),
    );
    return;
  }

  // Static Next.js assets and optimized images: serve cache first and refresh.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else (icons, offline page, etc.): stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }

  const {
    title = "Mélange",
    body = "You have a new notification.",
    icon = "/icon-192x192.png",
    badge = "/icon-192x192.png",
    data = {},
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data,
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/app";
  event.waitUntil(self.clients.openWindow(url));
});
