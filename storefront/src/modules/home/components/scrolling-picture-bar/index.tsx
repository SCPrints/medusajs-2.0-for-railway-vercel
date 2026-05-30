"use client"

import { useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SectionHeader from "@modules/common/components/section-header"

type BrandImageLink = {
  name: string
  href: string
  imageSrc: string
  imageAlt: string
}

/**
 * Curated brand banners for the home-page "Shop by brand" carousel. Every entry
 * needs a wide banner/poster image in /public/images/brands. Brands without a
 * banner (e.g. Ramo, Biz Care, Biz Corporates) are surfaced on the `/brands`
 * index + mega-menu instead. To add a brand here: drop a wide banner in the
 * brands folder and point `imageSrc` at it.
 */
const brandImageLinks: BrandImageLink[] = [
  {
    name: "AS Colour",
    href: "/store?brand=AS%20Colour",
    imageSrc: "/images/brands/as-colour-banner.png",
    imageAlt: "AS Colour apparel range",
  },
  {
    name: "Gildan",
    href: "/store?brand=Gildan",
    imageSrc: "/images/brands/gildan-banner.jpg",
    imageAlt: "Gildan blank apparel range",
  },
  {
    name: "Comfort Colors",
    href: "/store?brand=Comfort%20Colors",
    imageSrc: "/images/brands/comfort-colors-banner.jpg",
    imageAlt: "Comfort Colors garment-dyed apparel",
  },
  {
    name: "American Apparel",
    href: "/store?brand=American%20Apparel",
    imageSrc: "/images/brands/american-apparel-banner.jpg",
    imageAlt: "American Apparel premium basics",
  },
  {
    name: "Shaka Wear",
    href: "/store?brand=Shaka%20Wear",
    imageSrc: "/images/brands/shaka-wear-hero-poster.jpg",
    imageAlt: "Shaka Wear heavyweight streetwear",
  },
  {
    name: "Aussie Pacific",
    href: "/store?brand=Aussie%20Pacific",
    imageSrc: "/images/brands/aussie-pacific-banner.png",
    imageAlt: "Aussie Pacific workwear and casualwear",
  },
  {
    name: "Biz Collection",
    href: "/store?brand=Biz%20Collection",
    imageSrc: "/images/brands/biz-collection-banner.png",
    imageAlt: "Biz Collection uniforms and apparel",
  },
  {
    name: "Syzmik",
    href: "/store?brand=Syzmik",
    imageSrc: "/images/brands/syzmik-banner.png",
    imageAlt: "Syzmik workwear collection",
  },
  {
    name: "DNC Workwear",
    href: "/dnc",
    imageSrc: "/images/brands/dnc-banner.png",
    imageAlt: "DNC Workwear segmented hi-vis and workwear range",
  },
]

// Marquee speed (px/sec) — tuned to match the previous CSS marquee (~56px/s:
// 50% of the track over 46s) so the scroll feel is unchanged. Plus how long
// auto-scroll stays paused after a manual nudge so the smooth scroll can settle
// before the loop takes over again.
const AUTO_SCROLL_PX_PER_SEC = 56
const RESUME_AFTER_INTERACTION_MS = 2600

const ChevronIcon = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
  </svg>
)

const ScrollingPictureBar = () => {
  // The scroll viewport (overflow element — scrollLeft/scrollBy act on this).
  const viewportRef = useRef<HTMLDivElement>(null)
  // The inner flex track — its children are the cards we measure for stepping.
  const trackRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef(false)
  const pauseUntilRef = useRef(0)
  const reducedMotionRef = useRef(false)

  // Render the list twice so the auto-scroll can loop seamlessly.
  const scrollingImages = [...brandImageLinks, ...brandImageLinks]

  // Exact width of one full copy of the list (card→card distance across n cards),
  // so the wrap is pixel-perfect rather than approximated from scrollWidth/2.
  const measurePeriod = useCallback(() => {
    const track = trackRef.current
    const viewport = viewportRef.current
    const n = brandImageLinks.length
    if (track && track.children.length > n) {
      const first = track.children[0] as HTMLElement
      const nth = track.children[n] as HTMLElement
      const period = nth.offsetLeft - first.offsetLeft
      if (period > 0) return period
    }
    return viewport ? viewport.scrollWidth / 2 : 0
  }, [])

  // Continuous auto-scroll. Paused while the pointer is over the carousel, for a
  // short window after a manual nudge, or when the visitor prefers reduced motion.
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    reducedMotionRef.current = mq.matches
    const onMq = () => {
      reducedMotionRef.current = mq.matches
    }
    mq.addEventListener?.("change", onMq)

    // Per-effect local state (not refs) so React Strict Mode's dev
    // mount→cleanup→mount can't leave a second rAF loop alive — which would
    // double the scroll speed. Each invocation owns and cancels its own loop.
    let rafId = 0
    let lastTs: number | null = null
    let cancelled = false

    const tick = (ts: number) => {
      if (cancelled) return
      const viewport = viewportRef.current
      if (viewport) {
        if (lastTs === null) lastTs = ts
        const dt = ts - lastTs
        lastTs = ts
        const paused =
          hoverRef.current || ts < pauseUntilRef.current || reducedMotionRef.current
        if (!paused && dt > 0) {
          viewport.scrollLeft += (AUTO_SCROLL_PX_PER_SEC * dt) / 1000
          const period = measurePeriod()
          if (period > 0 && viewport.scrollLeft >= period) {
            viewport.scrollLeft -= period
          }
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      mq.removeEventListener?.("change", onMq)
    }
  }, [measurePeriod])

  // Advance one card in either direction. Re-bases into the first copy when near
  // a scroll edge so a nudge never dead-ends, then smooth-scrolls by one card.
  const step = useCallback(
    (dir: 1 | -1) => {
      const viewport = viewportRef.current
      const track = trackRef.current
      if (!viewport) return

      const period = measurePeriod()
      let cardStep = Math.round(viewport.clientWidth * 0.5)
      if (track && track.children.length >= 2) {
        const d =
          (track.children[1] as HTMLElement).offsetLeft -
          (track.children[0] as HTMLElement).offsetLeft
        if (d > 0) cardStep = d
      }

      // Keep the nudge away from the hard scroll edges. The right side always
      // has a full second copy of runway, so NEXT only needs to re-base once
      // we're already past one whole copy. The left edge (scrollLeft 0) is the
      // only dead-end, so for PREV near the start we hop forward one copy first
      // — seamless, since the two copies are identical.
      if (period > 0) {
        if (dir > 0 && viewport.scrollLeft >= period) {
          viewport.scrollLeft -= period
        } else if (dir < 0 && viewport.scrollLeft - cardStep < 0) {
          viewport.scrollLeft += period
        }
      }

      pauseUntilRef.current =
        (typeof performance !== "undefined" ? performance.now() : 0) +
        RESUME_AFTER_INTERACTION_MS
      viewport.scrollBy({
        left: dir * cardStep,
        behavior: reducedMotionRef.current ? "auto" : "smooth",
      })
    },
    [measurePeriod]
  )

  const handlePointerEnter = () => {
    hoverRef.current = true
  }
  const handlePointerLeave = () => {
    hoverRef.current = false
  }
  const handleTouchStart = () => {
    hoverRef.current = true
  }
  const handleTouchEnd = () => {
    hoverRef.current = false
    pauseUntilRef.current =
      (typeof performance !== "undefined" ? performance.now() : 0) +
      RESUME_AFTER_INTERACTION_MS
  }

  const arrowClass =
    "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ui-border-base bg-white/85 text-ui-fg-base shadow-elevation-card-rest backdrop-blur transition hover:bg-white hover:border-[var(--brand-secondary)]/60 hover:text-[var(--brand-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/50 small:h-12 small:w-12"

  return (
    <section className="w-full bg-ui-bg-base py-8 small:py-10">
      <div className="content-container">
        <SectionHeader
          eyebrow="Shop by brand"
          title="Pick a brand to view matching products"
        />
      </div>

      <div
        className="relative w-full"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={viewportRef}
          className="no-scrollbar w-full overflow-x-auto overflow-y-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          }}
        >
          <div ref={trackRef} className="flex w-max gap-8 py-1">
            {scrollingImages.map((brandImage, index) => {
              const isClone = index >= brandImageLinks.length
              return (
                <LocalizedClientLink
                  key={`${brandImage.name}-${index}`}
                  href={brandImage.href}
                  aria-hidden={isClone}
                  tabIndex={isClone ? -1 : undefined}
                  className="group relative h-[30vh] w-[60vw] shrink-0 overflow-hidden rounded-2xl border border-ui-border-base shadow-elevation-card-rest transition-all hover:border-[var(--brand-secondary)]/60 small:h-[36vh] small:w-[42vw]"
                >
                  <Image
                    src={brandImage.imageSrc}
                    alt={isClone ? "" : brandImage.imageAlt}
                    fill
                    sizes="(max-width: 1024px) 60vw, 42vw"
                    className="object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
                  <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-white/25 bg-black/45 px-3 py-2 backdrop-blur-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white small:text-base">
                      {brandImage.name}
                    </p>
                    <p className="text-xs text-white/80">View products</p>
                  </div>
                </LocalizedClientLink>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous brands"
          className={`${arrowClass} left-2 small:left-4`}
        >
          <ChevronIcon direction="left" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next brands"
          className={`${arrowClass} right-2 small:right-4`}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>
    </section>
  )
}

export default ScrollingPictureBar
