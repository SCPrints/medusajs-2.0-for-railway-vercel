"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import React from "react"

import { phCapture } from "@lib/posthog"

/**
 * If the URL still hasn't changed this long after an internal link click,
 * report it. This is the "click does nothing" symptom customers described for
 * months; the watchdog gives us the href, page and browser each time it recurs.
 */
const NAVIGATION_STALL_MS = 5000

const watchForStalledNavigation = (targetHref: string) => {
  if (typeof window === "undefined") return
  const from = window.location.href
  const target = new URL(targetHref, window.location.origin)
  // Clicking a link to the page you're already on is a no-op by design.
  if (target.pathname + target.search === window.location.pathname + window.location.search) {
    return
  }
  window.setTimeout(() => {
    if (window.location.href !== from) return
    phCapture("navigation_stalled", {
      href: target.pathname + target.search,
      from_path: window.location.pathname,
      elapsed_ms: NAVIGATION_STALL_MS,
      online: navigator.onLine,
      visibility: document.visibilityState,
    })
  }, NAVIGATION_STALL_MS)
}

/**
 * Use this component to create a Next.js `<Link />` that persists the current country code in the url,
 * without having to explicitly pass it as a prop.
 *
 * Plain `next/link` navigation on purpose. Until Oct 2026 every click here was
 * wrapped in `document.startViewTransition()`, which freezes painting from the
 * click until the new route commits (or the browser's ~4s timeout). On heavy
 * destinations that read as "I clicked and nothing happened" and was ~90% of
 * the client exceptions PostHog captured (View transition ... timed out /
 * aborted). The loading.tsx skeletons can only paint when nothing freezes them.
 */
const LocalizedClientLink = ({
  children,
  href,
  prefetch,
  onClick,
  ...props
}: {
  children?: React.ReactNode
  href: string
  /** Set `false` on dense product grids to avoid many RSC prefetches competing with the current page. */
  prefetch?: boolean
  className?: string
  onClick?: (() => void) | React.MouseEventHandler<HTMLAnchorElement>
  passHref?: true
  [x: string]: any
}) => {
  const { countryCode } = useParams()
  const normalizedCountryCode = Array.isArray(countryCode)
    ? countryCode[0]
    : countryCode
  const isExternalHref =
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  const localizedHref =
    isExternalHref || !normalizedCountryCode
      ? href
      : `/${normalizedCountryCode}${href}`

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    ;(onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined)?.(e)

    const opensElsewhere =
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      props.target === "_blank" ||
      props.download ||
      isExternalHref ||
      href.startsWith("#")
    if (!opensElsewhere) {
      watchForStalledNavigation(localizedHref)
    }
  }

  return (
    <Link href={localizedHref} prefetch={prefetch} {...props} onClick={handleClick}>
      {children}
    </Link>
  )
}

export default LocalizedClientLink
