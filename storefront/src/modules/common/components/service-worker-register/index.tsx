"use client"

import { useEffect } from "react"

/**
 * Registers `/sw.js` on mount in production. Skipped in dev because the
 * service worker would cache stale chunks across hot-reloads.
 *
 * The worker handles:
 *   - Offline navigation fallback to `/offline.html`
 *   - Stale-while-revalidate for static assets (next/static, brand imagery, fonts)
 *
 * Cache strategy lives in [storefront/public/sw.js](../../../../public/sw.js).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Registration failure isn't user-facing — site still works without
        // the SW. Swallow silently.
      })
    }

    if (document.readyState === "complete") {
      onLoad()
    } else {
      window.addEventListener("load", onLoad, { once: true })
      return () => window.removeEventListener("load", onLoad)
    }
  }, [])

  return null
}
