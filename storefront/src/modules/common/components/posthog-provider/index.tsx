"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

import { isInternalTraffic } from "@lib/internal-traffic"
import { phCapturePageView, phStart } from "@lib/posthog"
import { afterPageLoad } from "@lib/util/after-page-load"

/**
 * Bootstraps posthog-js once on the client and fires pageview captures on
 * App Router route changes (App Router doesn't auto-emit pageview events the
 * way the Pages Router did). Use `@lib/posthog` to capture: there is no React
 * context, because `posthog-js/react` pulls the whole SDK into the first load.
 *
 * Renders children without instrumentation when
 * NEXT_PUBLIC_POSTHOG_KEY isn't set (dev / preview environments
 * without the env var stay quiet — no console noise, no failed
 * network calls).
 */

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const apiHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"

const initPostHog = async () => {
  if (!apiKey || isInternalTraffic()) {
    phStart(null)
    return
  }
  const { default: posthog } = await import("posthog-js")
  posthog.init(apiKey, {
    api_host: apiHost,
    capture_pageview: false,
    person_profiles: "identified_only",
    autocapture: true,
    capture_exceptions: true,
    // web_vitals_attribution attaches the element behind each LCP / CLS /
    // INP sample ($web_vitals_*_event.attribution) so a bad score names
    // what moved instead of needing a session recording.
    capture_performance: { web_vitals: true, web_vitals_attribution: true },
    disable_session_recording: false,
    rate_limiting: { events_per_second: 10 },
    // Surveys aren't used on this storefront; opting out skips loading
    // surveys.js (~33 KiB) and removes its 5-min cache-TTL refetch.
    disable_surveys: true,
  })
  phStart(posthog)
}

// Download and start PostHog only after the page has loaded: in the first-load
// bundle its ~120 KB added ~0.7s to mobile LCP on every page.
if (typeof window !== "undefined" && apiKey) {
  afterPageLoad(() => {
    // A failed download (offline, ad blocker) just means no analytics this visit.
    initPostHog().catch(() => phStart(null))
  })
}

export const PostHogProvider = ({ children }: { children: React.ReactNode }) => {
  if (!apiKey) {
    // No-op passthrough so call sites can use phIdentify/phCapture
    // without conditionals — they just wait in the capped queue.
    return <>{children}</>
  }
  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  )
}

const PageViewTracker = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    const url =
      pathname +
      (searchParams && searchParams.toString()
        ? `?${searchParams.toString()}`
        : "")
    phCapturePageView(url)
  }, [pathname, searchParams])

  return null
}
