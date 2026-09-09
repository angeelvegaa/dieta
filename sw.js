/* Service worker: cache-first, versionado, con actualización automática.
   Para publicar una versión nueva: sube el número de VERSION. La versión nueva
   se instala, toma el control y la página se recarga sola en cuanto está lista
   (skipWaiting + clients.claim + controllerchange), sin depender de que el
   usuario pulse ningún aviso. El estado se guarda en cada interacción, así que
   la recarga no pierde nada.
   Se sirve desde una subruta (GitHub Pages), así que todas las rutas son
   relativas al propio sw.js. */

const VERSION = "v10";
const APP_CACHE = "dieta-app-" + VERSION;
const FONT_CACHE = "dieta-fonts";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/boot.js",
  "./js/app.js",
  "./js/autoexport.js",
  "./js/config.js",
  "./js/dates.js",
  "./js/storage.js",
  "./js/state.js",
  "./js/backup.js",
  "./js/sync.js",
  "./js/modal.js",
  "./js/toast.js",
  "./js/longpress.js",
  "./js/stats.js",
  "./js/pwa.js",
  "./js/ui/month.js",
  "./js/ui/settings.js",
  "./js/ui/cloud-sync.js",
  "./js/ui/history.js",
  "./js/ui/weight.js",
  "./js/ui/plan.js",
  "./js/ui/notes.js",
  "./js/ui/reminder.js",
  "./js/ui/actions.js",
  "./js/ui/pct-alert.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }
  if (url.origin === self.location.origin){
    e.respondWith(cacheFirst(req, APP_CACHE));
  }
});

async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (req.mode === "navigate"){
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw err;
  }
}
