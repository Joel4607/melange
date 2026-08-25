const LEGACY_CACHE_PREFIX = "melange-";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith(LEGACY_CACHE_PREFIX))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
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
