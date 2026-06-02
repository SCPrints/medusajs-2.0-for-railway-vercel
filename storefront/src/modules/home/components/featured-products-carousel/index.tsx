"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"

/**
 * Home-page product rail with its own header. The prev/next arrows live in the
 * header row (top-right) — NOT overlaid on the cards — so they never overlap
 * the product cards' GPU hover transforms. That overlap was the cause of the
 * arrows rendering behind cards / intermittent clicks; header placement makes
 * the controls a plain, always-clickable part of the layout.
 *
 * The cards are rendered server-side and passed in as children so all
 * pricing/data stays on the server; this client wrapper owns the scroll state.
 */
export default function FeaturedProductsCarousel({
  title,
  subtitle,
  viewAllHref,
  children,
}: {
  title: string
  subtitle?: string | null
  /** When set, a "View all products" link is shown alongside the arrows. */
  viewAllHref?: string
  children: ReactNode
}) {
  const scrollerRef = useRef<HTMLUListElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
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
    const amount = Math.min(el.clientWidth * 0.9, 600) * dir
    el.scrollBy({ left: amount, behavior: "smooth" })
  }

  const showArrows = canLeft || canRight

  return (
    <div>
      <SectionHeader
        eyebrow={subtitle ?? undefined}
        title={title}
        action={
          <div className="flex items-center gap-2">
            {showArrows ? (
              <div className="flex items-center gap-1.5">
                <ArrowButton
                  dir="left"
                  disabled={!canLeft}
                  onClick={() => scrollByCards(-1)}
                />
                <ArrowButton
                  dir="right"
                  disabled={!canRight}
                  onClick={() => scrollByCards(1)}
                />
              </div>
            ) : null}
            {viewAllHref ? (
              <LocalizedClientLink
                href={viewAllHref}
                className="group ml-1 inline-flex items-center gap-1.5 text-sm font-semibold text-ui-fg-base underline underline-offset-4 transition hover:text-[var(--brand-secondary)]"
              >
                View all products
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                >
                  <path d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </LocalizedClientLink>
            ) : null}
          </div>
        }
      />

      <ul
        ref={scrollerRef}
        aria-label={title}
        className="no-scrollbar flex list-none snap-x gap-5 overflow-x-auto pb-2"
      >
        {children}
      </ul>
    </div>
  )
}

function ArrowButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "left" | "right"
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={dir === "left" ? "Scroll products left" : "Scroll products right"}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-ui-border-base bg-white text-ui-fg-base shadow-sm transition hover:border-[var(--brand-secondary)]/50 hover:bg-ui-bg-subtle disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ui-border-base disabled:hover:bg-white"
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
        {dir === "left" ? <path d="M10 12L6 8l4-4" /> : <path d="M6 4l4 4-4 4" />}
      </svg>
    </button>
  )
}
