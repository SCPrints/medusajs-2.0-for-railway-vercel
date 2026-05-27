"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import React from "react"

/**
 * If the browser's startViewTransition() snapshot phase doesn't complete
 * within this many ms, fall back to a plain router.push so the click is
 * never lost. The customizer page in particular (Fabric.js canvas + the
 * 5500-line wizard) can stall the snapshot indefinitely, which previously
 * left users with a "click does nothing, URL doesn't change" hang on the
 * SC Prints logo and other internal links.
 */
const VIEW_TRANSITION_FALLBACK_MS = 250

const runPageTransition = () => {
  // Reset scroll to the top of the new page. Next.js's router.push normally
  // does this automatically with `scroll: true` (the default), but wrapping
  // the push inside `document.startViewTransition` + `startTransition`
  // (which next-view-transitions does internally) defers the scroll reset
  // until the transition completes — by which point the user briefly sees
  // the new page mounted at the previous scroll position. Doing it here
  // (inside `transition.ready`) means the actual DOM scroll happens while
  // the view-transition pseudo-elements still cover the page, so the user
  // sees a clean transition that lands at the top.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior })

  document.documentElement.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0.25, transform: "translateY(24%)" },
    ],
    {
      duration: 650,
      easing: "cubic-bezier(0.87, 0, 0.13, 1)",
      fill: "forwards",
      pseudoElement: "::view-transition-old(root)",
    }
  )

  document.documentElement.animate(
    [
      { clipPath: "polygon(0 0, 100% 0, 100% 0, 0 0)" },
      { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" },
    ],
    {
      duration: 650,
      easing: "cubic-bezier(0.87, 0, 0.13, 1)",
      fill: "forwards",
      pseudoElement: "::view-transition-new(root)",
    }
  )
}

type NavRouter = ReturnType<typeof useRouter>

/**
 * Navigate via the browser View Transitions API when available, with a hard
 * timeout fallback to plain `router.push` so a stalled snapshot phase never
 * blocks the click. Replaces the previous `next-view-transitions` integration
 * which had no timeout and hung indefinitely on heavy customizer pages.
 */
function navigateWithViewTransition(router: NavRouter, href: string): void {
  if (
    typeof document === "undefined" ||
    typeof (document as any).startViewTransition !== "function"
  ) {
    router.push(href)
    return
  }

  let didNavigate = false
  const navigate = () => {
    if (didNavigate) return
    didNavigate = true
    router.push(href)
  }

  const fallbackTimer = window.setTimeout(navigate, VIEW_TRANSITION_FALLBACK_MS)

  try {
    const transition = (document as any).startViewTransition(() => {
      window.clearTimeout(fallbackTimer)
      navigate()
    })
    // Fire the clip-path animation once the new DOM is snapshotted; any failure
    // (unsupported pseudo-elements, transition skip, etc.) is non-fatal — the
    // navigation itself is already in flight.
    if (transition?.ready && typeof transition.ready.then === "function") {
      transition.ready.then(runPageTransition).catch(() => undefined)
    }
  } catch {
    // startViewTransition can throw synchronously when called during an
    // active transition. Bail out cleanly to the timeout-driven fallback.
    window.clearTimeout(fallbackTimer)
    navigate()
  }
}

/**
 * Use this component to create a Next.js `<Link />` that persists the current country code in the url,
 * without having to explicitly pass it as a prop.
 */
const LocalizedClientLink = ({
  children,
  href,
  prefetch,
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
  const router = useRouter()
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
    const clickHandler = props.onClick
    if (typeof clickHandler === "function") {
      if (clickHandler.length === 0) {
        ;(clickHandler as () => void)()
      } else {
        ;(clickHandler as React.MouseEventHandler<HTMLAnchorElement>)(e)
      }
    }

    if (e.defaultPrevented) {
      return
    }

    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      props.target === "_blank" ||
      props.download ||
      isExternalHref ||
      href.startsWith("#")
    ) {
      return
    }

    e.preventDefault()
    navigateWithViewTransition(router, localizedHref)
  }

  return (
    <Link
      href={localizedHref}
      prefetch={prefetch}
      {...props}
      onClick={handleClick}
    >
      {children}
    </Link>
  )
}

export default LocalizedClientLink
