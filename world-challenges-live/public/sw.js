const CACHE_NAME = "wcq-v20261127-qaddaha-studio-sync-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/output-snapshot.js?v=20261127-qaddaha-studio-sync-v1",
  "/app.js?v=20261127-qaddaha-studio-sync-v1",
  "/app.js?v=118-main-portal-cache-bust",
  "/captain-sounds.js?v=118",
  "/output-snapshot.js?v=20261118-output-bridge-v1",
  "/app.js?v=20261118-independent-output-v1",
  "/style.css?v=20261118-operator-write-auth-v1",
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
  "/output.css?v=20261118-independent-output-v1",
  "/output-snapshot.js?v=20261118-output-bridge-v1",
  "/output.js?v=20261118-independent-output-v1",
  "/studio",
  "/studio-control",
  "/studio.css?v=20261118-independent-studio-v1",
  "/studio-director-state.js?v=20261118-independent-studio-v1",
  "/studio.js?v=20261118-independent-studio-v1",
  "/studio-control.css?v=20261118-independent-studio-v1",
  "/studio-control.js?v=20261118-independent-studio-v1",
  "/studio-v2",
  "/studio-v2.css?v=20261123-studio-v2-moment",
  "/studio-v2.js?v=20261123-studio-v2-phase3-moment",
  "/studio-moment.js?v=20261123-studio-v2-moment",
  "/studio-v2-state.js?v=20261123-studio-v2-phase3",
  "/studio-control-v2",
  "/studio-control-v2.css?v=20261123-studio-control-v2",
  "/studio-control-v2.js?v=20261123-studio-control-v2",
  "/images/qaddaha-studio-bg.webp",
  "/images/studio-mytwin.webp",
  "/images/studio-world-challenges.webp",
  "/images/qaddaha.png",
  "/images/mytwinlogo.png",
  "/images/studio-presenter-cutout.png",
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
