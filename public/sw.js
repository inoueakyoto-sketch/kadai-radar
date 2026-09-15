const CACHE = "kadai-radar-v0.6.6";
const CACHE_PREFIX = "kadai-radar-";

const scopedUrl = (path = "") => new URL(path, self.registration.scope).href;
const STATIC_SHELL = [scopedUrl("manifest.webmanifest"), scopedUrl("icon.svg")];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations must prefer the network so a newly deployed index.html never
  // points at removed, old hashed JavaScript bundles.
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(scopedUrl(""), response.clone());
        return response;
      } catch {
        return (await caches.match(scopedUrl(""))) || Response.error();
      }
    })());
    return;
  }

  // Hashed Vite assets are immutable. Network-first avoids stale bundles while
  // still allowing a cached response if the device is temporarily offline.
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
