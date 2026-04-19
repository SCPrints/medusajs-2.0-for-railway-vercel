"use client"

import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useRef } from "react"

import { BRAND_TILES, type BrandTile } from "@modules/brands/data/brands"

gsap.registerPlugin(ScrollTrigger)

function computeRadius(container: HTMLElement) {
  const w = container.offsetWidth
  const h = container.offsetHeight
  const base = Math.min(w, h)
  return Math.max(120, base * 0.34)
}

function tileTargets(
  tiles: BrandTile[],
  container: HTMLElement
): { x: number; y: number }[] {
  const r = computeRadius(container)
  return tiles.map((t) => ({
    x: Math.cos(t.angle) * r * t.radiusScale,
    y: Math.sin(t.angle) * r * t.radiusScale,
  }))
}

export default function BrandsHero() {
  const scrollTrackRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef<(HTMLDivElement | null)[]>([])

  useGSAP(
    () => {
      const track = scrollTrackRef.current
      const stage = stageRef.current
      if (!track || !stage) {
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

      const applyFinal = () => {
        const targets = tileTargets(BRAND_TILES, stage)
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
        applyFinal()
        return
      }

      const targets = tileTargets(BRAND_TILES, stage)
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
            trigger: track,
            start: "top top",
            end: "bottom bottom",
            scrub: 1.15,
            invalidateOnRefresh: true,
          },
        })
      })
    },
    { scope: scrollTrackRef, dependencies: [] }
  )

  return (
    <div ref={scrollTrackRef} className="relative min-h-[220vh] w-full">
      <div className="sticky top-0 flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-ui-bg-base">
        <div
          ref={stageRef}
          className="relative mx-auto flex h-full w-full max-w-[min(100%,56rem)] flex-col items-center justify-center px-4 pb-24 pt-16 small:px-8"
        >
          <div className="relative z-10 max-w-xl text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-ui-fg-subtle">
              Brands we decorate
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-ui-fg-base small:text-5xl">
              Trusted blanks &amp; retail names
            </h1>
            <p className="mt-4 text-base text-ui-fg-subtle">
              Scroll to see how we partner with leading apparel and headwear suppliers for
              screen printing, embroidery, and transfers.
            </p>
          </div>

          <div
            className="pointer-events-none absolute left-1/2 top-[52%] z-[1] h-[min(72vw,28rem)] w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 small:h-[min(60vw,32rem)] small:w-[min(88vw,44rem)]"
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
                  className={`flex h-full w-full items-center justify-center rounded-2xl text-[0.65rem] font-bold uppercase tracking-tight text-white shadow-lg ring-1 ring-black/10 small:text-xs ${brand.bgClass}`}
                >
                  {brand.initials}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
