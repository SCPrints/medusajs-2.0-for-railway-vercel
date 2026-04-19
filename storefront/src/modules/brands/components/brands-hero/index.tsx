"use client"

import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useRef, type CSSProperties } from "react"

import { BRAND_TILES } from "@modules/brands/data/brands"
import { computeTilePositions } from "@modules/brands/components/brands-hero/tile-placement"

gsap.registerPlugin(ScrollTrigger)

/** Timeline spacing (scrubbed to scroll — larger gap = more scroll between each line) */
const LINE_SCROLL_GAP = 0.42
const LINE_SCROLL_DURATION = 0.32
/** Fade/slide up from below */
const LINE_START_Y = 48

export default function BrandsHero() {
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<(HTMLDivElement | null)[]>([])
  const textLineRefs = useRef<(HTMLDivElement | null)[]>([])

  useGSAP(
    () => {
      const track = scrollTrackRef.current
      const ring = ringRef.current
      const lines = textLineRefs.current.filter(Boolean) as HTMLDivElement[]
      if (!track || !ring || lines.length === 0) {
        return
      }

      const tiles = tileRefs.current.filter(Boolean) as HTMLDivElement[]
      if (tiles.length === 0) {
        return
      }

      let reduced = false
      try {
        reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      } catch {
        reduced = false
      }

      const applyFinalTiles = () => {
        const targets = computeTilePositions(BRAND_TILES, ring)
        tiles.forEach((el, i) => {
          const t = targets[i]
          gsap.set(el, {
            xPercent: -50,
            yPercent: -50,
            x: t.x,
            y: t.y,
            scale: 1,
            opacity: 1,
            force3D: true,
          })
        })
      }

      if (reduced) {
        gsap.set(lines, { opacity: 1, y: 0 })
        applyFinalTiles()
        return
      }

      gsap.set(lines, { opacity: 0, y: LINE_START_Y })

      const scrollTriggerOpts = {
        trigger: track,
        start: "top top" as const,
        end: "bottom bottom" as const,
        scrub: 1.15,
        invalidateOnRefresh: true,
      }

      const textTl = gsap.timeline({ scrollTrigger: scrollTriggerOpts })
      lines.forEach((el, i) => {
        textTl.fromTo(
          el,
          { opacity: 0, y: LINE_START_Y },
          { opacity: 1, y: 0, duration: LINE_SCROLL_DURATION, ease: "power3.out" },
          i * LINE_SCROLL_GAP
        )
      })

      const targets = computeTilePositions(BRAND_TILES, ring)
      tiles.forEach((el, i) => {
        const t = targets[i]
        gsap.set(el, {
          xPercent: -50,
          yPercent: -50,
          x: 0,
          y: 0,
          scale: 0.82,
          opacity: 0.72,
          force3D: true,
        })
        gsap.to(el, {
          x: t.x,
          y: t.y,
          scale: 1,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            ...scrollTriggerOpts,
            id: `brand-tile-${i}`,
          },
        })
      })
    },
    { scope: scrollTrackRef, dependencies: [] }
  )

  return (
    <div ref={scrollTrackRef} className="relative min-h-[260vh] w-full">
      <div className="sticky top-0 flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-ui-bg-base">
        <div
          ref={stageRef}
          className="relative mx-auto flex h-full w-full max-w-[min(100%,56rem)] flex-col items-center justify-start px-4 pb-20 pt-10 small:px-8 small:pt-12"
        >
          <div className="relative z-20 w-full max-w-xl shrink-0 px-2 text-center">
            <div
              ref={(el) => {
                textLineRefs.current[0] = el
              }}
              className="overflow-hidden"
            >
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-ui-fg-subtle">
                Brands we decorate
              </p>
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-ui-fg-base small:text-5xl">
              <div
                ref={(el) => {
                  textLineRefs.current[1] = el
                }}
                className="overflow-hidden"
              >
                <span className="block">Trusted blanks &amp;</span>
              </div>
              <div
                ref={(el) => {
                  textLineRefs.current[2] = el
                }}
                className="overflow-hidden pt-1"
              >
                <span className="block">retail names</span>
              </div>
            </h1>
            <div
              ref={(el) => {
                textLineRefs.current[3] = el
              }}
              className="overflow-hidden mt-4"
            >
              <p className="text-base text-ui-fg-subtle">
                Scroll to see how we partner with leading apparel and headwear suppliers for
              </p>
            </div>
            <div
              ref={(el) => {
                textLineRefs.current[4] = el
              }}
              className="overflow-hidden mt-1"
            >
              <p className="text-base text-ui-fg-subtle">
                screen printing, embroidery, and transfers.
              </p>
            </div>
          </div>

          <div
            ref={ringRef}
            className="pointer-events-none relative z-[1] mt-6 flex min-h-[min(42vh,22rem)] w-full max-w-[min(96vw,44rem)] flex-1 items-center justify-center small:mt-8 small:min-h-[min(46vh,26rem)]"
            aria-hidden
          >
            {BRAND_TILES.map((brand, i) => (
              <div
                key={brand.id}
                ref={(el) => {
                  tileRefs.current[i] = el
                }}
                className="absolute left-1/2 top-1/2 h-[3.25rem] w-[3.25rem] small:h-14 small:w-14 will-change-transform"
              >
                <div
                  className={
                    i % 2 === 0
                      ? "motion-safe:animate-brand-tile-float motion-reduce:animate-none h-full w-full will-change-transform"
                      : "motion-safe:animate-brand-tile-float-alt motion-reduce:animate-none h-full w-full will-change-transform"
                  }
                  style={
                    {
                      animationDelay: `${(i % 7) * 0.22}s`,
                      "--brand-float-duration": `${5.2 + (i % 6) * 0.42}s`,
                    } as CSSProperties
                  }
                >
                  <div
                    className={`flex h-full w-full items-center justify-center rounded-2xl text-[0.65rem] font-bold uppercase tracking-tight text-white shadow-lg ring-1 ring-black/10 small:text-xs ${brand.bgClass}`}
                  >
                    {brand.initials}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
