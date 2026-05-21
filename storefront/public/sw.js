/**
 * SC Prints service worker — minimal offline shell.
 *
 * Strategy:
 *   - Navigations: network-first, fall back to cached offline page.
 *   - Static assets (next/static, /branding/*, fonts, images): stale-while-revalidate.
 *   - API + store routes (/api/*, /store/*, /admin/*): always network. Cache would
 *     return stale carts / outdated prices and isn't worth the offline win.
 *
 * Versioned cache name so a bump to CACHE_VERSION discards previous caches on activate.
 */
const CACHE_VERSION = "v1"
const SHELL_CACHE = `scp-shell-${CACHE_VERSION}`
const ASSET_CACHE = `scp-assets-${CACHE_VERSION}`
const OFFLINE_URL = "/offline.html"

const SHELL_URLS = [
  OFFLINE_URL,
  "/branding/sc-prints-logo-transparent.png",
  "/branding/scp-vector.svg",
  "/manifest.webmanifest",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true
  if (url.pathname.startsWith("/branding/")) return true
  if (url.pathname.startsWith("/checkout/")) return true
  if (url.pathname.startsWith("/images/")) return true
  if (/\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    return true
  }
  return false
}

function isApiOrStore(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/store/") ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/hooks/")
  )
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isApiOrStore(url)) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (cached) =>
            cached ||
            new Response("Offline", {
              status: 503,
              statusText: "Offline",
              headers: { "Content-Type": "text/plain" },
            })
        )
      )
    )
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok && response.type === "basic") {
              cache.put(request, response.clone())
            }
            return response
          })
          .catch(() => cached)
        return cached || fetchPromise
      })
    )
  }
})
