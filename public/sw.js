/**
 * Service worker: offline shell plus push notification delivery.
 *
 * The push and notificationclick handlers below are what let a notification
 * arrive with the app closed and the screen off. A page calling
 * `new Notification()` can only do so while it is open and running; the
 * browser's push service wakes this worker instead, independently of any tab.
 */
const CACHE = "sipngo-static-v2";
const PRECACHE = ["/icon-192x192.png", "/icon-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for images and icons, network for everything else.
  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});

self.addEventListener("push", (event) => {
  // A push with no readable payload still deserves a notification: on most
  // platforms failing to show one after waking for a push is a policy
  // violation and repeated offences cost the site its permission.
  let payload = { title: "SipNGo", body: "You have an update.", url: "/orders" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      // Replaces an earlier notification about the same order rather than
      // stacking a new one for every status change.
      tag: payload.tag || "sipngo",
      renotify: !!payload.tag,
      vibrate: [100, 50, 100],
      data: { url: payload.url || "/orders" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/orders";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if the app is already open, rather than
      // opening a second copy of it.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
