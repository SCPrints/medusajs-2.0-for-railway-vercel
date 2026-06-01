"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Hook price for the hero CTA. Mirrors the AS Colour Staple at the deepest
// bulk-screen-print tier (100+ qty, 1-colour screen). When pricing changes,
// update this value AND the asterisk caveat copy below so the two stay honest.
const HERO_FROM_PRICE_LABEL = "$15.68"
const HERO_FROM_PRICE_CAVEAT =
  "Per-unit, 100+ garments, 1-colour screen print on AS Colour Staple. See per-product pricing for your run."

export default function HeroOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end pb-16 small:justify-center small:pb-0"
      aria-labelledby="hero-headline"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent"
        aria-hidden
      />

      <div className="content-container relative">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            Custom Apparel · NSW, AU
          </p>
          <h1
            id="hero-headline"
            className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white small:text-5xl large:text-6xl"
            style={{ textShadow: "0 2px 16px rgba(0,0,0,0.55)" }}
          >
            Custom print apparel for teams, brands &amp; events.
          </h1>
          <p
            className="mt-4 max-w-xl text-base text-white/85 small:text-lg"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}
          >
            Screen print, embroidery, digital transfer &mdash; done in-house
            with proofs in 24 hours.
          </p>

          {/* "From $X*" headline hook. The asterisk reveals the caveat on
              hover/focus — keeps the headline punchy while staying honest
              about the qty/method that achieves the floor price. */}
          <p
            className="mt-5 text-base text-white/95 small:text-lg"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.45)" }}
          >
            <span className="font-medium">Custom tees from </span>
            <span className="text-xl font-bold text-white small:text-2xl">
              {HERO_FROM_PRICE_LABEL}
            </span>
            <span
              className="group/caveat pointer-events-auto relative ml-0.5 inline-block cursor-help align-baseline focus:outline-none"
              tabIndex={0}
              role="note"
              aria-label={HERO_FROM_PRICE_CAVEAT}
            >
              <span aria-hidden className="font-bold text-white/90">
                *
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-20 w-64 -translate-x-1/2 rounded-lg bg-ui-fg-base px-3 py-2 text-[11px] font-normal leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-200 group-hover/caveat:opacity-100 group-focus-within/caveat:opacity-100"
                style={{ textShadow: "none" }}
              >
                {HERO_FROM_PRICE_CAVEAT}
              </span>
            </span>
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <LocalizedClientLink
              href="/store"
              className="pointer-events-auto inline-flex items-center rounded-lg border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
            >
              Browse range
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/contact"
              className="pointer-events-auto inline-flex items-center rounded-lg border border-white/20 bg-transparent px-6 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
            >
              Get a quote
            </LocalizedClientLink>
          </div>
        </div>
      </div>
    </div>
  )
}
