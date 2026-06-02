"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

/**
 * Horizontal product rail with prev/next arrow controls. Wraps the home-page
 * curated sections (and the popular-products fallback). The cards are rendered
 * server-side and passed in as children so all pricing/data stays on the
 * server; this client wrapper only owns the scroll affordance.
 *
 * Arrows auto-hide when the content fits (no overflow) and dim at each end.
 * The underlying list stays natively scrollable (touch / trackpad), so the
 * arrows are a progressive enhancement, not the only way to scroll.
 */
export default function FeaturedProductsCarousel({
  children,
  ariaLabel,
}: {
  children: ReactNode
  ariaLabel?: string
}) {
  const scrollerRef = useRef<HTMLUListElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    // 2px tolerance for sub-pixel rounding
    setCanLeft(el.scrollLeft > 2)
    setCanRight(el.scrollLeft < maxScroll - 2)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateArrows()
    el.addEventListener("scroll", updateArrows, { passive: true })
    window.addEventListener("resize", updateArrows)
    return () => {
      el.removeEventListener("scroll", updateArrows)
      window.removeEventListener("resize", updateArrows)
    }
  }, [updateArrows])

  const scrollByCards = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    // Scroll by ~2 cards (card 280px + gap 20px), clamped to the viewport.
    const amount = Math.min(el.clientWidth * 0.9, 600) * dir
    el.scrollBy({ left: amount, behavior: "smooth" })
  }

  const hasArrows = canLeft || canRight

  return (
    <div className="relative">
      {/* Prev */}
      <button
        type="button"
        aria-label="Scroll products left"
        onClick={() => scrollByCards(-1)}
        className={`absolute left-1.5 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ui-border-base bg-white text-ui-fg-base shadow-md transition hover:bg-ui-bg-subtle disabled:pointer-events-none disabled:opacity-0 tablet:flex ${
          hasArrows ? "" : "tablet:!hidden"
        }`}
        disabled={!canLeft}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10 12L6 8l4-4" />
        </svg>
      </button>

      {/* Next */}
      <button
        type="button"
        aria-label="Scroll products right"
        onClick={() => scrollByCards(1)}
        className={`absolute right-1.5 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ui-border-base bg-white text-ui-fg-base shadow-md transition hover:bg-ui-bg-subtle disabled:pointer-events-none disabled:opacity-0 tablet:flex ${
          hasArrows ? "" : "tablet:!hidden"
        }`}
        disabled={!canRight}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>

      <ul
        ref={scrollerRef}
        aria-label={ariaLabel}
        className="no-scrollbar flex list-none snap-x gap-5 overflow-x-auto pb-2"
      >
        {children}
      </ul>
    </div>
  )
}
