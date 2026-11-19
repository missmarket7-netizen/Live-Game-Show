const CACHE_NAME = "wcq-v20261118-space-station-cinematic-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/app.js?v=20261116-studio-v1",
  "/style.css?v=20261116-studio-v1",
  "/arena-extras.css?v=107",
  "/arena-extras.css?v=110",
  "/manifest.json?v=20261106",
  "/favicon.svg",
  "/space-station/",
  "/space-station/space-station-3d.js",
  "/space-station/tiktok-live-client.js",
  "/space-station/README.md",
  "/space-station/performance-report.md",
  "/output",
  "/output.css?v=20261114-qaddaha-output-v1",
  "/output.js?v=20261114-qaddaha-output-v1",
  "/studio",
  "/studio-control",
  "/studio.css?v=20261116-studio-v1",
  "/studio.js?v=20261116-studio-v1",
  "/studio-control.css?v=20261116-studio-v1",
  "/studio-control.js?v=20261116-studio-v1",
  "/images/qaddaha-studio-bg.webp",
  "/images/studio-mytwin.webp",
  "/images/studio-world-challenges.webp",
  "/images/qaddaha.png",
  "/images/mytwinlogo.png",
  "/manus-routes.json"
];
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
