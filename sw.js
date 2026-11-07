const SHELL_CACHE = "hyakumeizan-shell-v19";
const TILE_CACHE = "hyakumeizan-tiles-v1";
const TILE_MAX = 400;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=19",
  "./app.js",
  "./app.js?v=19",
  "./data/mountains.json",
  "./vendor/leaflet.css",
  "./vendor/leaflet.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== TILE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.hostname === "cyberjapandata.gsi.go.jp") {
    event.respondWith(cacheTiles(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch (error) {
        if (cached) return cached;
        if (request.mode === "navigate") {
          const page = await caches.match("./index.html");
          if (page) return page;
        }
        throw error;
      }
    }),
  );
});

async function cacheTiles(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    pruneTiles(cache);
  }
  return response;
}

async function pruneTiles(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_MAX) return;
  await Promise.all(keys.slice(0, keys.length - TILE_MAX).map((key) => cache.delete(key)));
}
