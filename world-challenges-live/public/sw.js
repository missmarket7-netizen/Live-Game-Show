const CACHE_NAME = "wcq-v20261108-space-lounge-v2";
const APP_SHELL = ["/", "/index.html", "/style.css?v=20261108-cinematic-audience", "/arena-extras.css?v=20261106", "/manifest.json?v=20261108-cinematic-audience", "/favicon.svg", "/space-lounge", "/space-lounge.css?v=20261108-v2", "/space-lounge.js?v=20261108-v2", "/images/mytwinlogo.png", "/manus-routes.json"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/live/")) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && url.origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))));
});
