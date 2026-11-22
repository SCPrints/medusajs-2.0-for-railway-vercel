/**
 * Thin wrapper over posthog-js so call sites don't have to know about
 * the SDK directly. Mirrors the shape of `@lib/analytics` (the GA4
 * wrapper) so the two libraries can coexist without colliding.
 *
 * posthog-js (~120 KB gzipped) is downloaded after page load, so it must only
 * ever be a type import here. Calls made before it arrives are queued.
 *
 * Every public function is a no-op when:
 *   - SSR (no window)
 *   - analytics is off (NEXT_PUBLIC_POSTHOG_KEY missing, staff browser)
 *   - the user has opted out (PostHog handles this internally)
 *
 * Reach for this module for explicit events PostHog should know about
 * but GA4 doesn't need (e.g. customer login → identify, customizer
 * canvas action). Standard funnel events still flow through GA4.
 */

import type { PostHog } from "posthog-js"

const MAX_QUEUED = 100

type Call = (posthog: PostHog) => void

let client: PostHog | null = null
let queue: Call[] | null = []

const send = (call: Call) => {
  if (typeof window === "undefined") return
  if (!client) {
    if (queue && queue.length < MAX_QUEUED) queue.push(call)
    return
  }
  try {
    call(client)
  } catch {
    // never throw from analytics
  }
}

/** Hand over the initialised SDK, or null when analytics is off for this visit. */
export const phStart = (posthog: PostHog | null) => {
  client = posthog
  const waiting = queue
  queue = null
  if (posthog) waiting?.forEach(send)
}

export const phIdentify = (
  distinctId: string,
  properties?: Record<string, any>
) => {
  if (!distinctId) return
  send((posthog) => posthog.identify(distinctId, properties))
}

/**
 * Resets the recording session — call on logout so a returning
 * anonymous visitor doesn't get tied to the previous customer.
 */
export const phReset = () => {
  send((posthog) => posthog.reset())
}

export const phCapture = (event: string, properties?: Record<string, any>) => {
  if (!event) return
  send((posthog) => posthog.capture(event, properties))
}

export const phCaptureException = (
  error: unknown,
  properties?: Record<string, any>
) => {
  send((posthog) => posthog.captureException(error, properties))
}

/** Manual pageview — App Router doesn't auto-fire on route change. */
export const phCapturePageView = (url?: string) => {
  send((posthog) =>
    posthog.capture("$pageview", url ? { $current_url: url } : undefined)
  )
}
