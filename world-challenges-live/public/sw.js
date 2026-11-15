const CACHE_NAME = "wcq-v20261115-space-lounge-cinematic-v1";
const APP_SHELL = ["/", "/index.html", "/app.js?v=20261115-qaddaha-output-v2", "/style.css?v=20261114-studio-output-1", "/arena-extras.css?v=107", "/manifest.json?v=20261106", "/favicon.svg", "/space-lounge", "/space-lounge.css?v=7", "/space-lounge.js?v=7", "/space-lounge-3d.js?v=7", "/output", "/output.css?v=20261114-qaddaha-output-v1", "/output.js?v=20261114-qaddaha-output-v1", "/images/mytwinlogo.png", "/manus-routes.json"];
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
