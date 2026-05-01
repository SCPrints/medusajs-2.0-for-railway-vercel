"use client"

import { useGSAP } from "@gsap/react"
import { Lora } from "next/font/google"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import type { CSSProperties } from "react"
import { useRef } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ScrollExpandingGraphic from "@modules/home/components/scroll-expanding-graphic"

gsap.registerPlugin(ScrollTrigger)

const lora = Lora({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600"],
})

/** ~Anthropic “warm paper” around the card */
const TRACK_BG = "#F5F2ED"
/** In-card surface */
const CARD_BG = "#1A1A1A"
const CARD_MAX_PX = 1200
const CARD_RADIUS_PX = 32
/** Scroll distance (viewport heights) mapped to the expand animation; lower = quicker to scroll past. */
const TRACK_MIN_HEIGHT_VH = 150
const SIDE_GUTTER_PX = 24
/** Starting width as a fraction of viewport before expansion (larger “hero” card) */
const CARD_START_VW = 0.56
/** Max starting width on large screens — still leaves room to grow to full bleed */
const CARD_START_MAX_PX = 680
/**
 * Scrub smoothing (seconds of lag). Higher = softer motion; `true` is 1:1 and feels twitchy.
 */
const SCRUB_SMOOTHING = 1.35

function getStartMaxWidth() {
  if (typeof window === "undefined") {
    return 540
  }
  const vw = window.innerWidth
  const gutters = SIDE_GUTTER_PX * 2
  const fromFraction = Math.round(vw * CARD_START_VW)
  const maxStart = Math.min(CARD_START_MAX_PX, CARD_MAX_PX - 32)
  const minStart = Math.min(240, vw - gutters)
  return Math.min(vw - gutters, Math.max(minStart, Math.min(fromFraction, maxStart)))
}

function getEndMaxWidth() {
  if (typeof window === "undefined") {
    return CARD_MAX_PX
  }
  return window.innerWidth
}

export type ScrollExpandingCta = { href: string; label: string }

const DEFAULT_COPY = {
  eyebrow: "",
  title: "Bring your own blanks—we’ll decorate them.",
  body: undefined as string | undefined,
  primaryCta: { href: "/contact", label: "Contact us" } satisfies ScrollExpandingCta,
  secondaryCta: null as ScrollExpandingCta | null,
}

export type ScrollExpandingSectionProps = {
  eyebrow?: string
  title?: string
  body?: string
  primaryCta?: ScrollExpandingCta
  secondaryCta?: ScrollExpandingCta | null
}

function CtaLink({ href, label, className }: ScrollExpandingCta & { className: string }) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    )
  }
  return (
    <LocalizedClientLink href={href} className={className}>
      {label}
    </LocalizedClientLink>
  )
}

/**
 * Sticky, scroll-scrubbed dark card: narrow + rounded → full-bleed + square corners (Anthropic-style).
 * Copy stays in a fixed-width column so it doesn’t reflow as the shell grows; only the graphic flexes.
 */
export default function ScrollExpandingSection({
  eyebrow = DEFAULT_COPY.eyebrow,
  title = DEFAULT_COPY.title,
  body = DEFAULT_COPY.body,
  primaryCta = DEFAULT_COPY.primaryCta,
  secondaryCta = DEFAULT_COPY.secondaryCta,
}: ScrollExpandingSectionProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const stickyStageRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const hexBackRef = useRef<HTMLDivElement>(null)
  const hexMidRef = useRef<HTMLDivElement>(null)
  const hexFrontRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const track = trackRef.current
      const card = cardRef.current
      if (!track || !card) {
        return
      }

      let reduced = false
      try {
        reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      } catch {
        reduced = false
      }

      const layerBack = hexBackRef.current
      const layerMid = hexMidRef.current
      const layerFront = hexFrontRef.current

      if (reduced) {
        gsap.set(card, {
          maxWidth: getEndMaxWidth(),
          borderRadius: 0,
        })
        const endLayers = [
          { el: layerBack, x: -8, y: 12, z: 5, scale: 1.025, rotationX: 1.6, rotationY: -0.8 },
          { el: layerMid, x: 5, y: 22, z: 11, scale: 1.055, rotationX: 1, rotationY: 0.6 },
          { el: layerFront, x: 10, y: 34, z: 18, scale: 1.085, rotationX: -0.5, rotationY: 1.2 },
        ]
        endLayers.forEach(({ el, ...rest }) => {
          if (el) gsap.set(el, { ...rest, force3D: true })
        })
        return
      }

      const startW = getStartMaxWidth()
      gsap.set(card, {
        maxWidth: startW,
        borderRadius: CARD_RADIUS_PX,
      })
      const layerStarts = [
        { el: layerBack, x: 0, y: 0, z: -32, scale: 1, rotationX: 0, rotationY: 0 },
        { el: layerMid, x: 0, y: 0, z: -16, scale: 1, rotationX: 0, rotationY: 0 },
        { el: layerFront, x: 0, y: 0, z: 0, scale: 1, rotationX: 0, rotationY: 0 },
      ]
      layerStarts.forEach(({ el, ...rest }) => {
        if (el) gsap.set(el, { ...rest, force3D: true })
      })

      const layerEase = "power2.inOut"

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: track,
          start: "top top",
          end: "bottom bottom",
          scrub: SCRUB_SMOOTHING,
          invalidateOnRefresh: true,
        },
      })

      tl.fromTo(
        card,
        {
          maxWidth: () => getStartMaxWidth(),
          borderRadius: CARD_RADIUS_PX,
        },
        {
          maxWidth: () => getEndMaxWidth(),
          borderRadius: 0,
          ease: "power2.inOut",
        },
        0
      )

      if (layerBack) {
        tl.fromTo(
          layerBack,
          {
            x: 0,
            y: 0,
            z: -32,
            scale: 1,
            rotationX: 0,
            rotationY: 0,
            force3D: true,
          },
          {
            x: -8,
            y: 12,
            z: 5,
            scale: 1.025,
            rotationX: 1.6,
            rotationY: -0.8,
            ease: layerEase,
          },
          0
        )
      }
      if (layerMid) {
        tl.fromTo(
          layerMid,
          {
            x: 0,
            y: 0,
            z: -16,
            scale: 1,
            rotationX: 0,
            rotationY: 0,
            force3D: true,
          },
          {
            x: 5,
            y: 22,
            z: 11,
            scale: 1.055,
            rotationX: 1,
            rotationY: 0.6,
            ease: layerEase,
          },
          0
        )
      }
      if (layerFront) {
        tl.fromTo(
          layerFront,
          {
            x: 0,
            y: 0,
            z: 0,
            scale: 1,
            rotationX: 0,
            rotationY: 0,
            force3D: true,
          },
          {
            x: 10,
            y: 34,
            z: 18,
            scale: 1.085,
            rotationX: -0.5,
            rotationY: 1.2,
            ease: layerEase,
          },
          0
        )
      }

      return () => {
        tl.scrollTrigger?.kill()
        tl.kill()
      }
    },
    { scope: trackRef, dependencies: [] }
  )

  const cardStyle = {
    borderRadius: CARD_RADIUS_PX,
    backgroundColor: CARD_BG,
  } as CSSProperties

  const showBody = Boolean(body?.trim())

  return (
    <div
      ref={trackRef}
      className="relative w-full overflow-x-clip"
      style={{ minHeight: `${TRACK_MIN_HEIGHT_VH}vh`, backgroundColor: TRACK_BG }}
    >
      <div
        ref={stickyStageRef}
        className="sticky top-0 z-[1] flex min-h-[100dvh] w-full flex-col items-center justify-center px-3 small:px-5 pt-20 small:pt-24"
        style={{ backgroundColor: TRACK_BG }}
      >
        <div
          ref={cardRef}
          className="mx-auto box-border w-full max-w-[min(680px,56vw,calc(100vw-48px))] overflow-hidden text-white shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
          style={cardStyle}
        >
          {/*
            Content stays a fixed-size cluster centered in the card; only the dark panel grows outward.
          */}
          <div className="flex min-h-[min(62dvh,520px)] w-full items-center justify-center px-6 py-11 small:min-h-[min(68dvh,580px)] small:px-10 small:py-14">
            <div className="flex max-w-full flex-col items-center justify-center gap-8 small:flex-row small:gap-10 md:gap-12">
              <div className="w-[min(100%,17.5rem)] shrink-0 text-center small:w-[min(100%,19rem)] small:text-left md:w-[min(100%,22rem)]">
                {eyebrow ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
                    {eyebrow}
                  </p>
                ) : null}
                <h2
                  className={`${lora.className} ${eyebrow ? "mt-3" : ""} text-[1.6rem] font-medium leading-[1.18] tracking-[-0.02em] text-white small:text-[1.85rem] md:text-4xl`}
                >
                  {title}
                </h2>
                {showBody ? (
                  <p
                    className="mt-4 text-[0.95rem] leading-relaxed text-white/80 small:text-base"
                    style={{ fontFamily: "inherit" }}
                  >
                    {body}
                  </p>
                ) : null}
                <div
                  className={`flex justify-center small:justify-start ${showBody ? "mt-7" : "mt-6"}`}
                >
                  <CtaLink
                    href={primaryCta.href}
                    label={primaryCta.label}
                    className="!text-[#1A1A1A] inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-medium transition hover:bg-white/90"
                  />
                </div>
                {secondaryCta ? (
                  <div className="mt-4 flex justify-center small:justify-start">
                    <CtaLink
                      href={secondaryCta.href}
                      label={secondaryCta.label}
                      className="!text-white/80 text-sm font-medium underline decoration-white/35 underline-offset-[5px] transition hover:!text-white"
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 justify-center overflow-visible">
                <ScrollExpandingGraphic
                  layerRefs={{
                    back: hexBackRef,
                    mid: hexMidRef,
                    front: hexFrontRef,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
