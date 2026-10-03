/*
 * Till service worker: lets /pos open (and a reload keep working) while the server is unreachable.
 *
 *  - /_next/static/*  cache-first (files are content-hashed, so a cached copy is never wrong)
 *  - /pos navigations network-first with a short timeout, falling back to the last good copy
 *
 * Nothing else is touched: API calls, other pages and non-GET requests go straight to the network.
 * Sale data is never cached here; unsent sales live in IndexedDB (see lib/pos/offlineStore.ts).
 */
const SHELL = "pos-shell-v1";
const STATIC = "pos-static-v1";
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL && key !== STATIC) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL);
  const key = new URL(request.url).pathname + new URL(request.url).search;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), NAV_TIMEOUT_MS);
    const res = await fetch(request, { signal: ctl.signal });
    clearTimeout(timer);
    // Keep only a genuine till page: not a redirect to sign-in, not an error page.
    if (res.ok && !res.redirected && new URL(res.url).pathname.startsWith("/pos")) {
      cache.put(key, res.clone());
    }
    return res;
  } catch {
    const exact = await cache.match(key);
    if (exact) return exact;
    for (const k of await cache.keys()) {
      if (new URL(k.url).pathname === "/pos") return cache.match(k);
    }
    return new Response(
      "<!doctype html><meta charset=utf-8><title>Till offline</title><body style=\"font-family:sans-serif;padding:2rem\"><h1>This till is offline</h1><p>The server cannot be reached and this device has not opened the till before. Reconnect and reload.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate" && (url.pathname === "/pos" || url.pathname.startsWith("/pos/"))) {
    event.respondWith(networkFirstPage(request));
  }
});
