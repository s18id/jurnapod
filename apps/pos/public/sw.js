// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

const APP_SHELL_CACHE = "jurnapod-pos-app-shell-v5";
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/app-icon-192.png",
  "/icons/app-icon-512.png",
  "/screenshots/checkout-wide.png",
  "/screenshots/checkout-mobile.png"
];

function isCoreShellPath(pathname) {
  return APP_SHELL_URLS.includes(pathname) || pathname === "/";
}

async function precacheBuildAssets(cache) {
  try {
    const indexResponse = await fetch("/index.html", { cache: "no-store" });
    if (!indexResponse.ok) {
      return;
    }

    const html = await indexResponse.text();
    const assetMatches = html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g);
    const assetUrls = [];
    for (const match of assetMatches) {
      const assetUrl = match[1];
      if (!assetUrls.includes(assetUrl)) {
        assetUrls.push(assetUrl);
      }
    }

    if (assetUrls.length > 0) {
      await cache.addAll(assetUrls);
    }
  } catch {
    // Ignore precache failures; runtime caching still applies.
  }
}

async function cacheShellResponse(request, response) {
  if (!response || response.type === "error") {
    return;
  }

  const cache = await caches.open(APP_SHELL_CACHE);
  await cache.put(request, response.clone());
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const networkResponse = await fetch(request);
  await cacheShellResponse(request, networkResponse);
  return networkResponse;
}

async function navigationWithShellFallback(event) {
  const cache = await caches.open(APP_SHELL_CACHE);

  try {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
      await cacheShellResponse(event.request, preloadResponse);
      return preloadResponse;
    }

    const networkResponse = await fetch(event.request);
    await cacheShellResponse(event.request, networkResponse);
    return networkResponse;
  } catch {
    const cachedNavigation = await cache.match(event.request);
    if (cachedNavigation) {
      return cachedNavigation;
    }

    const shell = await cache.match("/index.html");
    if (shell) {
      return shell;
    }

    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    await cache.addAll(APP_SHELL_URLS);
    await precacheBuildAssets(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== APP_SHELL_CACHE).map((key) => caches.delete(key)));

    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationWithShellFallback(event));
    return;
  }

  const cacheableAsset = url.pathname.startsWith("/assets/") || isCoreShellPath(url.pathname);
  if (cacheableAsset) {
    event.respondWith(cacheFirst(request));
  }
});
