"use client"

import { CheckCircleSolid, Spinner } from "@medusajs/icons"
import confetti from "canvas-confetti"
import { motion } from "framer-motion"
import Image from "next/image"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react"
import { createPortal } from "react-dom"

import MiniBubblePop from "@modules/common/components/mini-bubble-pop"
import MiniTetris from "@modules/common/components/mini-tetris"

const SLOT_H = 40
const LASER_BURST_BEAM_COUNT = 30
const TRAIL_LASER_BEAM_COUNT = 20
const TRAIL_LASER_LENGTH_PX = 96
const TRAIL_SAMPLE_MS = 100
const NAV_CART_SELECTOR = "[data-testid='nav-cart-link']"
const FLYING_IMG = "/branding/sc-prints-logo-transparent.png"

type FlyPayload = {
  startX: number
  startY: number
  endX: number
  endY: number
  id: string
} | null

type MegaLaserFinalePayload = {
  id: string
  sites: { cx: number; cy: number }[]
  beamLength: number
}

type FlyComboVariantId =
  | "full"
  | "classic-full"
  | "trail-only"
  | "finale-only"
  | "confetti-trail"
  | "trail-lasers-confetti"
  | "trail-shells-lasers"

type FlyComboVariantFlags = {
  trailGreyscaleConfetti: boolean
  trailGreyscaleShells: boolean
  chipLasers: boolean
  megaFinale: boolean
  /** Logo bitmap + greyscale palette; `false` = library default colors and circle/square/star. */
  brandedLogoGreyscale: boolean
}

const FLY_COMBO_VARIANTS: Record<
  FlyComboVariantId,
  { label: string; description: string; flags: FlyComboVariantFlags }
> = {
  full: {
    label: "Greyscale hearts",
    description:
      "Heart-shaped confetti in a greyscale palette on the trail and shells, plus chip lasers and mega finale (canvas-confetti `shapeFromPath`).",
    flags: {
      trailGreyscaleConfetti: true,
      trailGreyscaleShells: true,
      chipLasers: true,
      megaFinale: true,
      brandedLogoGreyscale: true,
    },
  },
  "classic-full": {
    label: "Colorful hearts",
    description:
      "Same layout as greyscale hearts (trail + finale + lasers), but default colorful heart particles—no forced greyscale palette.",
    flags: {
      trailGreyscaleConfetti: true,
      trailGreyscaleShells: true,
      chipLasers: true,
      megaFinale: true,
      brandedLogoGreyscale: false,
    },
  },
  "trail-only": {
    label: "Trail only",
    description: "Same trail as full; no arrival mega burst.",
    flags: {
      trailGreyscaleConfetti: true,
      trailGreyscaleShells: true,
      chipLasers: true,
      megaFinale: false,
      brandedLogoGreyscale: true,
    },
  },
  "finale-only": {
    label: "Arrival only",
    description: "Fly only; confetti, shells, and lasers on cart landing.",
    flags: {
      trailGreyscaleConfetti: false,
      trailGreyscaleShells: false,
      chipLasers: false,
      megaFinale: true,
      brandedLogoGreyscale: true,
    },
  },
  "confetti-trail": {
    label: "Confetti follow",
    description: "Greyscale puffs along path; full greyscale finale.",
    flags: {
      trailGreyscaleConfetti: true,
      trailGreyscaleShells: false,
      chipLasers: false,
      megaFinale: true,
      brandedLogoGreyscale: true,
    },
  },
  "trail-lasers-confetti": {
    label: "Confetti + lasers",
    description: "Puffs + on-chip lasers; full finale.",
    flags: {
      trailGreyscaleConfetti: true,
      trailGreyscaleShells: false,
      chipLasers: true,
      megaFinale: true,
      brandedLogoGreyscale: true,
    },
  },
  "trail-shells-lasers": {
    label: "Shells + lasers",
    description: "Greyscale heart shells along the path + chip lasers; full finale.",
    flags: {
      trailGreyscaleConfetti: false,
      trailGreyscaleShells: true,
      chipLasers: true,
      megaFinale: true,
      brandedLogoGreyscale: true,
    },
  },
}

type MorphState = "idle" | "adding" | "success"

type Ripple = { id: string; x: number; y: number }

const squishTransition = { type: "spring" as const, stiffness: 500, damping: 18 }

function canVibrate() {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  )
}

let earconContext: AudioContext | null = null

/** Soft UI “click” for demos — no asset file. Swap to `use-sound` + a tiny MP3 in production if you prefer. */
function playAddEarcon() {
  if (typeof window === "undefined") {
    return
  }
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    return
  }
  if (!earconContext) {
    earconContext = new Ctor()
  }
  const ctx = earconContext
  if (ctx.state === "suspended") {
    void ctx.resume()
  }
  const t0 = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = "sine"
  osc.frequency.setValueAtTime(640, t0)
  osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.06)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11)
  osc.connect(gain)
  gain.connect(ctx.destination)
  try {
    osc.start(t0)
    osc.stop(t0 + 0.12)
  } catch {
    // ignore: already stopped or suspended context
  }
}

function fireConfettiAtClientPoint(clientX: number, clientY: number) {
  const x = clientX / window.innerWidth
  const y = clientY / window.innerHeight
  confetti({
    particleCount: 64,
    spread: 70,
    origin: { x, y },
    startVelocity: 28,
    ticks: 120,
  })
}

/** Zinc-style greys for the 1+3+4+8 combo; canvas-confetti picks randomly per particle. */
const GREYSCALE_CONFETTI_COLORS = [
  "#fafafa",
  "#e4e4e7",
  "#d4d4d8",
  "#a1a1aa",
  "#71717a",
  "#52525b",
  "#3f3f46",
]

/**
 * Compact heart for `canvas-confetti` `shapeFromPath` (filled path; picks up `colors` per particle).
 * Based on common 24×24-style icon coordinates.
 */
const HEART_CONFETTI_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"

/** Fly animation hit box (heart is slightly taller than wide in the 24×24 path). */
const FLYING_HEART_W = 48
const FLYING_HEART_H = 54

const FLYING_HEART_MASK = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="${HEART_CONFETTI_PATH}"/></svg>`
)}")`

const flyingHeartLogoMaskStyle: CSSProperties = {
  WebkitMaskImage: FLYING_HEART_MASK,
  maskImage: FLYING_HEART_MASK,
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
}

function FlyingHeartLogo({
  className,
  imageClassName,
}: {
  className?: string
  imageClassName?: string
}) {
  return (
    <div
      className={className}
      style={{ width: FLYING_HEART_W, height: FLYING_HEART_H }}
    >
      <Image
        src={FLYING_IMG}
        alt=""
        width={FLYING_HEART_W}
        height={FLYING_HEART_H}
        className={
          imageClassName ?? "block h-full w-full object-cover object-center"
        }
        style={flyingHeartLogoMaskStyle}
      />
    </div>
  )
}

let heartConfettiShapeCache: ReturnType<typeof confetti.shapeFromPath> | null =
  null

function getHeartConfettiShape(): ReturnType<
  typeof confetti.shapeFromPath
> | null {
  if (typeof document === "undefined") {
    return null
  }
  if (heartConfettiShapeCache) {
    return heartConfettiShapeCache
  }
  try {
    heartConfettiShapeCache = confetti.shapeFromPath({
      path: HEART_CONFETTI_PATH,
    })
  } catch {
    return null
  }
  return heartConfettiShapeCache
}

type ComboConfettiShapeEntry =
  | ReturnType<typeof confetti.shapeFromPath>
  | "circle"
  | "square"
  | "star"

function getComboConfettiShapes(): ComboConfettiShapeEntry[] {
  const h = getHeartConfettiShape()
  return h ? [h] : ["circle", "square"]
}

function getClassicComboConfettiShapes(): ComboConfettiShapeEntry[] {
  const h = getHeartConfettiShape()
  return h ? [h] : ["circle", "square", "star"]
}

function fireGreyscaleConfettiAtClientPoint(
  clientX: number,
  clientY: number,
  particleCount = 64,
  brandedLogoGreyscale = true
) {
  const x = clientX / window.innerWidth
  const y = clientY / window.innerHeight
  if (!brandedLogoGreyscale) {
    confetti({
      particleCount,
      spread: 360,
      origin: { x, y },
      startVelocity: 28,
      ticks: 120,
      shapes: getClassicComboConfettiShapes(),
    })
    return
  }
  confetti({
    particleCount,
    spread: 360,
    origin: { x, y },
    startVelocity: 28,
    ticks: 120,
    colors: GREYSCALE_CONFETTI_COLORS,
    shapes: getComboConfettiShapes(),
  })
}

function fireFireworkShell(
  clientX: number,
  clientY: number,
  opts: {
    particleCount: number
    startVelocity: number
    zIndex?: number
    ticks?: number
    scalar?: number
    colors?: string[]
    brandedLogoGreyscale?: boolean
  }
) {
  const x = clientX / window.innerWidth
  const y = clientY / window.innerHeight
  const branded = opts.brandedLogoGreyscale !== false
  confetti({
    particleCount: opts.particleCount,
    spread: 360,
    startVelocity: opts.startVelocity,
    origin: { x, y },
    ticks: opts.ticks ?? 240,
    gravity: 1,
    decay: 0.92,
    ...(branded
      ? {
          colors: opts.colors ?? GREYSCALE_CONFETTI_COLORS,
          shapes: getComboConfettiShapes(),
        }
      : {
          shapes: getClassicComboConfettiShapes(),
        }),
    scalar: opts.scalar ?? 1.05,
    zIndex: opts.zIndex ?? 110,
  })
}

function buildFinaleLaserSites(cartCx: number, cartCy: number) {
  const w = window.innerWidth
  const h = window.innerHeight
  return [
    { cx: cartCx, cy: cartCy },
    { cx: w * 0.5, cy: h * 0.5 },
    { cx: w * 0.12, cy: h * 0.18 },
    { cx: w * 0.88, cy: h * 0.18 },
    { cx: w * 0.12, cy: h * 0.82 },
    { cx: w * 0.88, cy: h * 0.82 },
    { cx: w * 0.5, cy: h * 0.1 },
    { cx: w * 0.5, cy: h * 0.9 },
    { cx: w * 0.08, cy: h * 0.5 },
    { cx: w * 0.92, cy: h * 0.5 },
  ]
}

/** Full-screen confetti + fireworks when the flying chip reaches the cart (combo demo). */
function fireMegaCartArrivalFinale(
  cartCx: number,
  cartCy: number,
  brandedLogoGreyscale = true
) {
  const w = window.innerWidth
  const h = window.innerHeight
  const z = 250

  const normOrigins: [number, number][] = [
    [0.08, 0.12],
    [0.5, 0.08],
    [0.92, 0.12],
    [0.06, 0.42],
    [0.94, 0.42],
    [0.5, 0.38],
    [0.12, 0.72],
    [0.88, 0.72],
    [0.5, 0.92],
    [cartCx / w, cartCy / h],
  ]

  normOrigins.forEach(([ox, oy], i) => {
    window.setTimeout(() => {
      const useStars = i % 2 === 0
      confetti({
        particleCount: useStars ? 220 : 200,
        spread: 360,
        startVelocity: useStars ? 42 : 40,
        origin: { x: ox, y: oy },
        ticks: useStars ? 340 : 360,
        gravity: 1,
        decay: 0.92,
        ...(brandedLogoGreyscale
          ? {
              colors: GREYSCALE_CONFETTI_COLORS,
              shapes: getComboConfettiShapes(),
            }
          : {
              shapes: getClassicComboConfettiShapes(),
            }),
        scalar: useStars ? 1.12 : 1.05,
        zIndex: z,
      })
    }, i * 55)
  })

  fireGreyscaleConfettiAtClientPoint(
    cartCx,
    cartCy,
    64 * 28,
    brandedLogoGreyscale
  )

  for (let i = 0; i < 14; i++) {
    window.setTimeout(() => {
      const rx =
        w * (0.12 + Math.random() * 0.76)
      const ry =
        h * (0.1 + Math.random() * 0.8)
      fireFireworkShell(rx, ry, {
        particleCount: 155 + Math.floor(Math.random() * 50),
        startVelocity: 44 + Math.random() * 12,
        zIndex: z,
        ticks: 300,
        scalar: 1.2,
        brandedLogoGreyscale,
      })
    }, 40 + i * 125)
  }
}

function rainbowLaserBeamGradient(beamIndex: number, totalBeams: number): string {
  const h0 = (beamIndex / totalBeams) * 360
  const h1 = (h0 + 52) % 360
  const h2 = (h0 + 118) % 360
  const h3 = (h0 + 200) % 360
  return `linear-gradient(to top,
    hsl(${h0}, 100%, 72%) 0%,
    hsl(${h1}, 96%, 60%) 12%,
    hsl(${h2}, 92%, 52%) 28%,
    hsl(${h3}, 88%, 48%) 48%,
    hsla(${h0}, 85%, 55%, 0.2) 68%,
    transparent 100%)`
}

function rainbowLaserBeamGlow(beamIndex: number, totalBeams: number): string {
  const h = (beamIndex / totalBeams) * 360
  const hB = (h + 72) % 360
  const hC = (h + 144) % 360
  return `0 0 10px hsla(${h},100%,62%,0.9),
    0 0 22px hsla(${hB},100%,58%,0.55),
    0 0 38px hsla(${hC},100%,52%,0.28)`
}

function TrailingLaserBurst({
  beamLengthPx,
  beamCount = TRAIL_LASER_BEAM_COUNT,
  beamWidthPx = 2,
  flashSizePx = 28,
  beamDuration = 0.42,
  staggerSpreadSec,
  innerRingLengthFraction,
}: {
  beamLengthPx: number
  beamCount?: number
  beamWidthPx?: number
  flashSizePx?: number
  beamDuration?: number
  /** Max delay spread for the beam wave (seconds). Defaults from beam count + rings. */
  staggerSpreadSec?: number
  /** If set (e.g. 0.38), draws a shorter inner ring between outer beams, with its own delayed wave. */
  innerRingLengthFraction?: number
}) {
  const uid = useId()
  const halfFlash = flashSizePx / 2

  const rings: { length: number; rotOffsetDeg: number; delayOffset: number; widthMul: number }[] =
    [
      {
        length: beamLengthPx,
        rotOffsetDeg: 0,
        delayOffset: 0,
        widthMul: 1,
      },
    ]
  if (
    innerRingLengthFraction !== undefined &&
    innerRingLengthFraction > 0 &&
    beamLengthPx > 40
  ) {
    rings.push({
      length: beamLengthPx * innerRingLengthFraction,
      rotOffsetDeg: 360 / (2 * beamCount),
      delayOffset: 0,
      widthMul: 0.82,
    })
  }

  const totalRays = rings.length * beamCount
  const stagger =
    staggerSpreadSec ??
    Math.min(0.58, 0.011 * beamCount + (rings.length > 1 ? 0.14 : 0))
  const innerExtraDelay = rings.length > 1 ? stagger * 0.38 : 0
  const flashDelay = Math.min(0.1, stagger * 0.18)

  return (
    <div className="pointer-events-none relative h-0 w-0" aria-hidden>
      <motion.div
        className="absolute rounded-full"
        style={{
          width: flashSizePx,
          height: flashSizePx,
          left: -halfFlash,
          top: -halfFlash,
          background:
            "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.98) 0%, rgba(253,186,116,0.85) 22%, rgba(244,114,182,0.7) 42%, rgba(147,197,253,0.55) 62%, rgba(167,139,250,0.35) 78%, transparent 88%)",
          boxShadow:
            "0 0 14px rgba(255,255,255,0.9), 0 0 28px rgba(244,114,182,0.55), 0 0 42px rgba(56,189,248,0.4), 0 0 56px rgba(167,139,250,0.25)",
        }}
        initial={{ scale: 0.12, opacity: 1 }}
        animate={{ scale: 1.9, opacity: 0 }}
        transition={{
          duration: 0.32,
          delay: flashDelay,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
      {rings.flatMap((ring, ringIdx) => {
        const ringDelayBase =
          ringIdx === 0 ? ring.delayOffset : innerExtraDelay
        return Array.from({ length: beamCount }, (_, i) => {
          const deg = (360 / beamCount) * i + ring.rotOffsetDeg
          const rayIdx = ringIdx * beamCount + i
          const denom = Math.max(beamCount - 1, 1)
          const waveDelay = ringDelayBase + (i / denom) * stagger
          const w = beamWidthPx * ring.widthMul
          const halfW = w / 2
          return (
            <div
              key={`${uid}-r${ringIdx}-b${i}`}
              className="absolute left-0 top-0"
              style={{ transform: `rotate(${deg}deg)` }}
            >
              <motion.div
                className="absolute rounded-full"
                style={{
                  width: w,
                  height: ring.length,
                  left: -halfW,
                  top: -ring.length,
                  transformOrigin: "50% 100%",
                  background: rainbowLaserBeamGradient(rayIdx, totalRays),
                  boxShadow: rainbowLaserBeamGlow(rayIdx, totalRays),
                }}
                initial={{ scaleY: 0, opacity: 1 }}
                animate={{ scaleY: 1, opacity: 0 }}
                transition={{
                  duration: beamDuration,
                  delay: waveDelay,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </div>
          )
        })
      })}
    </div>
  )
}

export type AnimationLabSectionProps = {
  title: string
  description?: string
  children: React.ReactNode
}

function FlyToCartButton({
  onFlyComplete,
  demoCartRef,
  withSquish = false,
}: {
  onFlyComplete: () => void
  demoCartRef: React.RefObject<HTMLButtonElement | null>
  /** Pair with the tactile #4 “squish” (whileTap scale) on the same control. */
  withSquish?: boolean
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [fly, setFly] = useState<FlyPayload>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const resolveEndRect = useCallback((): DOMRect | null => {
    const nav = document.querySelector(
      NAV_CART_SELECTOR
    ) as HTMLElement | null
    if (nav) {
      return nav.getBoundingClientRect()
    }
    if (demoCartRef.current) {
      return demoCartRef.current.getBoundingClientRect()
    }
    return null
  }, [demoCartRef])

  const handleAdd = useCallback(() => {
    if (!btnRef.current) {
      return
    }
    const endRect = resolveEndRect()
    if (!endRect) {
      return
    }
    const startRect = btnRef.current.getBoundingClientRect()
    const startX = startRect.left + startRect.width / 2 - FLYING_HEART_W / 2
    const startY = startRect.top + startRect.height / 2 - FLYING_HEART_H / 2
    const endX = endRect.left + endRect.width / 2 - FLYING_HEART_W / 2
    const endY = endRect.top + endRect.height / 2 - FLYING_HEART_H / 2
    setFly({
      id: `${Date.now()}`,
      startX,
      startY,
      endX,
      endY,
    })
  }, [resolveEndRect])

  const flyOverlay =
    mounted &&
    fly &&
    createPortal(
      <motion.div
        key={fly.id}
        className="pointer-events-none fixed z-[200] overflow-hidden drop-shadow-md"
        style={{
          left: 0,
          top: 0,
          width: FLYING_HEART_W,
          height: FLYING_HEART_H,
        }}
        initial={{ x: fly.startX, y: fly.startY, scale: 0.4, opacity: 0.95 }}
        animate={{ x: fly.endX, y: fly.endY, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 85, damping: 20, mass: 1.8 }}
        onAnimationComplete={() => {
          setFly(null)
          onFlyComplete()
        }}
      >
        <FlyingHeartLogo />
      </motion.div>,
      document.body
    )

  const triggerClassName =
    "min-w-[160px] rounded-md bg-ui-fg-base px-4 py-2.5 text-sm font-medium text-ui-bg-base transition-colors hover:opacity-90"

  return (
    <>
      {withSquish ? (
        <motion.button
          type="button"
          ref={btnRef}
          onClick={handleAdd}
          whileTap={{ scale: 0.95 }}
          transition={squishTransition}
          className={triggerClassName}
        >
          Add to cart
        </motion.button>
      ) : (
        <button
          type="button"
          ref={btnRef}
          onClick={handleAdd}
          className={triggerClassName}
        >
          Add to cart
        </button>
      )}
      {flyOverlay}
    </>
  )
}

function FlyConfettiSquishSlotComboButton({
  variant,
  onFlyComplete,
  demoCartRef,
}: {
  variant: FlyComboVariantId
  onFlyComplete: () => void
  demoCartRef: React.RefObject<HTMLButtonElement | null>
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const flyItemRef = useRef<HTMLDivElement | null>(null)
  const flyTrailActiveRef = useRef(false)
  const [fly, setFly] = useState<FlyPayload>(null)
  const [megaLaserFinale, setMegaLaserFinale] =
    useState<MegaLaserFinalePayload | null>(null)
  const [trailPulse, setTrailPulse] = useState(0)
  const [mounted, setMounted] = useState(false)
  const [slid, setSlid] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!megaLaserFinale) {
      return
    }
    const t = window.setTimeout(() => setMegaLaserFinale(null), 1600)
    return () => clearTimeout(t)
  }, [megaLaserFinale])

  useEffect(() => {
    if (!fly) {
      flyTrailActiveRef.current = false
      setTrailPulse(0)
      return
    }
    const {
      trailGreyscaleConfetti,
      trailGreyscaleShells,
      chipLasers,
      brandedLogoGreyscale,
    } = FLY_COMBO_VARIANTS[variant].flags

    const hasTrail =
      trailGreyscaleConfetti || trailGreyscaleShells || chipLasers
    if (!hasTrail) {
      flyTrailActiveRef.current = false
      setTrailPulse(0)
      return
    }

    flyTrailActiveRef.current = true
    if (chipLasers) {
      setTrailPulse(1)
    } else {
      setTrailPulse(0)
    }

    const iv = window.setInterval(() => {
      if (!flyTrailActiveRef.current) {
        return
      }
      const el = flyItemRef.current
      if (!el) {
        return
      }
      const r = el.getBoundingClientRect()
      const tcx = r.left + r.width / 2
      const tcy = r.top + r.height / 2
      if (trailGreyscaleConfetti) {
        fireGreyscaleConfettiAtClientPoint(
          tcx,
          tcy,
          34,
          brandedLogoGreyscale
        )
      }
      if (trailGreyscaleShells) {
        fireFireworkShell(tcx, tcy, {
          particleCount: 40,
          startVelocity: 25,
          brandedLogoGreyscale,
        })
      }
      if (chipLasers) {
        setTrailPulse((p) => p + 1)
      }
    }, TRAIL_SAMPLE_MS)
    return () => {
      flyTrailActiveRef.current = false
      window.clearInterval(iv)
    }
  }, [fly?.id, variant])

  const resolveEndRect = useCallback((): DOMRect | null => {
    const nav = document.querySelector(
      NAV_CART_SELECTOR
    ) as HTMLElement | null
    if (nav) {
      return nav.getBoundingClientRect()
    }
    if (demoCartRef.current) {
      return demoCartRef.current.getBoundingClientRect()
    }
    return null
  }, [demoCartRef])

  const handleAdd = useCallback(() => {
    if (slid) {
      return
    }
    if (!btnRef.current) {
      return
    }
    const endRect = resolveEndRect()
    if (!endRect) {
      return
    }
    const startRect = btnRef.current.getBoundingClientRect()

    setSlid(true)
    window.setTimeout(() => setSlid(false), 2000)

    const startX = startRect.left + startRect.width / 2 - FLYING_HEART_W / 2
    const startY = startRect.top + startRect.height / 2 - FLYING_HEART_H / 2
    const endX = endRect.left + endRect.width / 2 - FLYING_HEART_W / 2
    const endY = endRect.top + endRect.height / 2 - FLYING_HEART_H / 2
    setFly({
      id: `${Date.now()}`,
      startX,
      startY,
      endX,
      endY,
    })
  }, [resolveEndRect, slid])

  const flyOverlay =
    mounted &&
    fly &&
    createPortal(
      <motion.div
        ref={flyItemRef}
        key={fly.id}
        className="pointer-events-none fixed z-[200] overflow-visible drop-shadow-md"
        style={{
          left: 0,
          top: 0,
          width: FLYING_HEART_W,
          height: FLYING_HEART_H,
        }}
        initial={{ x: fly.startX, y: fly.startY, scale: 0.4, opacity: 0.95 }}
        animate={{ x: fly.endX, y: fly.endY, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 85, damping: 20, mass: 1.8 }}
        onAnimationComplete={() => {
          const el = flyItemRef.current
          const r = el?.getBoundingClientRect()
          const ecx = r
            ? r.left + r.width / 2
            : fly.endX + FLYING_HEART_W / 2
          const ecy = r
            ? r.top + r.height / 2
            : fly.endY + FLYING_HEART_H / 2
          const { megaFinale, brandedLogoGreyscale } =
            FLY_COMBO_VARIANTS[variant].flags
          if (megaFinale) {
            const w = window.innerWidth
            const h = window.innerHeight
            const beamL = Math.round(Math.max(w, h) * 0.52)
            setMegaLaserFinale({
              id: `mega-${Date.now()}`,
              sites: buildFinaleLaserSites(ecx, ecy),
              beamLength: beamL,
            })
            fireMegaCartArrivalFinale(ecx, ecy, brandedLogoGreyscale)
          }
          setFly(null)
          onFlyComplete()
        }}
      >
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-0 w-0 -translate-x-1/2 -translate-y-1/2">
          {trailPulse > 0 ? (
            <TrailingLaserBurst
              key={trailPulse}
              beamLengthPx={TRAIL_LASER_LENGTH_PX}
              beamCount={TRAIL_LASER_BEAM_COUNT}
            />
          ) : null}
        </div>
        <FlyingHeartLogo className="relative z-[1]" />
      </motion.div>,
      document.body
    )

  const megaLaserOverlay =
    mounted &&
    megaLaserFinale &&
    createPortal(
      <div
        className="pointer-events-none fixed inset-0 z-[240]"
        aria-hidden
        key={megaLaserFinale.id}
      >
        {megaLaserFinale.sites.map((site, si) => (
          <div
            key={`${megaLaserFinale.id}-site-${si}`}
            className="absolute"
            style={{ left: site.cx, top: site.cy }}
          >
            <TrailingLaserBurst
              beamLengthPx={megaLaserFinale.beamLength}
              beamCount={LASER_BURST_BEAM_COUNT}
              beamWidthPx={3}
              flashSizePx={48}
              beamDuration={0.55}
              staggerSpreadSec={0.62}
              innerRingLengthFraction={0.4}
            />
          </div>
        ))}
      </div>,
      document.body
    )

  return (
    <>
      <motion.button
        type="button"
        ref={btnRef}
        onClick={handleAdd}
        whileTap={{ scale: 0.95 }}
        transition={squishTransition}
        disabled={slid}
        className="relative h-10 w-[200px] overflow-hidden rounded-md border border-ui-border-base bg-violet-700 px-0 text-sm font-medium text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-90"
      >
        <motion.div
          className="flex flex-col"
          animate={{ y: slid ? -SLOT_H : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          style={{ willChange: "transform" }}
        >
          <div className="flex h-10 items-center justify-center">Add to cart</div>
          <div className="flex h-10 items-center justify-center">Added!</div>
        </motion.div>
      </motion.button>
      {flyOverlay}
      {megaLaserOverlay}
    </>
  )
}

function MorphAddButton() {
  const [state, setState] = useState<MorphState>("idle")

  const handleClick = () => {
    if (state !== "idle") {
      return
    }
    setState("adding")
    window.setTimeout(() => {
      setState("success")
      window.setTimeout(() => {
        setState("idle")
      }, 2000)
    }, 800)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "adding"}
      className={[
        "flex min-w-[200px] items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-300",
        state === "success"
          ? "bg-emerald-600 text-white"
          : "bg-zinc-900 text-white hover:bg-zinc-800",
        state === "adding" && "cursor-wait opacity-90",
      ].join(" ")}
    >
      {state === "adding" && (
        <Spinner className="h-4 w-4 animate-spin text-inherit" />
      )}
      {state === "success" && (
        <CheckCircleSolid className="h-4 w-4 text-white" />
      )}
      <span>
        {state === "adding" && "Adding…"}
        {state === "success" && "Added!"}
        {state === "idle" && "Add to cart"}
      </span>
    </button>
  )
}

function ConfettiAddButton() {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      type="button"
      ref={ref}
      onClick={(e) => {
        if (ref.current) {
          const r = ref.current.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          fireConfettiAtClientPoint(cx, cy)
        } else {
          fireConfettiAtClientPoint(e.clientX, e.clientY)
        }
      }}
      className="min-w-[160px] rounded-md bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
    >
      Celebrate add
    </button>
  )
}

function SquishAddButton() {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={squishTransition}
      className="min-w-[160px] rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white"
    >
      Add to cart
    </motion.button>
  )
}

function RippleAddButton() {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const addRipple = (e: MouseEvent<HTMLButtonElement>) => {
    const t = e.currentTarget
    const r = t.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const id = `r-${Date.now()}-${Math.random().toString(16).slice(2)}`
    setRipples((prev) => [...prev, { id, x, y }])
  }

  return (
    <button
      type="button"
      onClick={addRipple}
      className="relative min-w-[200px] overflow-hidden rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
    >
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          className="pointer-events-none absolute rounded-full bg-white/40"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 8,
            height: 8,
            marginLeft: -4,
            marginTop: -4,
          }}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 20, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          onAnimationComplete={() => {
            setRipples((prev) => prev.filter((x) => x.id !== ripple.id))
          }}
        />
      ))}
      <span className="relative z-[1]">Add to cart</span>
    </button>
  )
}

function HapticAddButton() {
  const [last, setLast] = useState<string>("—")
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => {
          if (canVibrate()) {
            navigator.vibrate(50)
            setLast("Vibration sent (50ms).")
          } else {
            setLast("Not available in this browser / device.")
          }
        }}
        className="min-w-[160px] rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-600"
      >
        Add (haptic)
      </button>
      <p className="text-xs text-ui-fg-muted max-w-sm">
        Status: {last} Use Chrome on Android for hardware vibration; iOS
        Safari does not expose this API to web pages in most cases.
      </p>
    </div>
  )
}

const COIN_PERSPECTIVE = 900

function CoinFlip3DButton() {
  const [flipped, setFlipped] = useState(false)
  return (
    <div
      className="inline-block"
      style={{ perspective: `${COIN_PERSPECTIVE}px` }}
    >
      <motion.button
        type="button"
        onClick={() => {
          if (flipped) {
            return
          }
          setFlipped(true)
          window.setTimeout(() => setFlipped(false), 2200)
        }}
        className="relative h-11 w-[200px] cursor-pointer select-none border-0 p-0 [transform-style:preserve-3d] rounded-md outline-none"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateX: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 95, damping: 16, mass: 0.6 }}
        aria-pressed={flipped}
      >
        <span
          className="absolute inset-0 z-0 flex items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          Add to cart
        </span>
        <span
          className="absolute inset-0 z-0 flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 text-sm font-medium text-white [transform:rotateX(180deg)]"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <CheckCircleSolid className="h-4 w-4 shrink-0" />
          Added
        </span>
      </motion.button>
    </div>
  )
}

function SlotMachineTextButton() {
  const [slid, setSlid] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (slid) {
          return
        }
        setSlid(true)
        window.setTimeout(() => setSlid(false), 2000)
      }}
      className="relative h-10 w-[200px] overflow-hidden rounded-md border border-ui-border-base bg-violet-700 px-0 text-sm font-medium text-white hover:bg-violet-600"
    >
      <motion.div
        className="flex flex-col"
        animate={{ y: slid ? -SLOT_H : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        style={{ willChange: "transform" }}
      >
        <div className="flex h-10 items-center justify-center">Add to cart</div>
        <div className="flex h-10 items-center justify-center">Added!</div>
      </motion.div>
    </button>
  )
}

function ProgressFillButton() {
  const [phase, setPhase] = useState<"idle" | "filling" | "success">("idle")
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    if (phase !== "success") {
      return
    }
    const t = window.setTimeout(() => {
      setPhase("idle")
    }, 2000)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <button
      type="button"
      onClick={() => {
        if (phase !== "idle") {
          return
        }
        setRunId((k) => k + 1)
        setPhase("filling")
      }}
      className="relative h-10 min-w-[200px] overflow-hidden rounded-md bg-rose-500 px-4 text-sm font-medium text-white"
    >
      {phase === "filling" && (
        <motion.div
          key={runId}
          className="absolute inset-0 z-0 h-full origin-left bg-rose-800/50"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          onAnimationComplete={() => {
            setPhase("success")
          }}
        />
      )}
      {phase === "success" && (
        <div className="absolute inset-0 z-0 bg-rose-800/50" aria-hidden />
      )}
      <span className="relative z-[1]">
        {phase === "success" ? "Added!" : "Add to cart"}
      </span>
    </button>
  )
}

function ShimmerSweepButton() {
  const [n, setN] = useState(0)
  return (
    <button
      type="button"
      onClick={() => setN((c) => c + 1)}
      className="relative min-w-[200px] overflow-hidden rounded-md border border-zinc-400 bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm hover:from-zinc-50 hover:to-zinc-200"
    >
      <span className="relative z-[1]">Add to cart</span>
      {n > 0 && (
        <motion.span
          key={n}
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          aria-hidden
        >
          <motion.span
            className="absolute top-0 h-full w-2/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            style={{ transform: "skewX(-18deg) translateX(-20%)" }}
            initial={{ left: "-50%" }}
            animate={{ left: "130%" }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
          />
        </motion.span>
      )}
    </button>
  )
}

function EarconAddButton() {
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          playAddEarcon()
          setNote("Played earcon (Web Audio).")
          window.setTimeout(() => setNote(null), 2500)
        }}
        className="w-fit min-w-[200px] rounded-md bg-cyan-800 px-4 py-2.5 text-left text-sm font-medium text-white hover:bg-cyan-700"
      >
        Add to cart
      </button>
      <p className="text-xs text-ui-fg-muted max-w-xl">
        {note ??
          "Demo uses a short synthesized tone (no file). In production, pair a tiny .mp3 or .wav in /public with the use-sound hook or HTMLAudioElement for a hand-crafted earcon."}
      </p>
    </div>
  )
}

export function useButtonAnimationsLabSections(
  LabSection: (props: AnimationLabSectionProps) => React.ReactElement | null
) {
  const demoCartRef = useRef<HTMLButtonElement>(null)
  const [flyHint, setFlyHint] = useState(false)
  const [flyHintSquish, setFlyHintSquish] = useState(false)
  const [flyHint138, setFlyHint138] = useState(false)
  const [flyComboVariant, setFlyComboVariant] =
    useState<FlyComboVariantId>("full")

  useEffect(() => {
    getHeartConfettiShape()
  }, [])

  const chrome = (
    <>
      <p className="text-xs text-ui-fg-muted max-w-2xl">
        Dev-only add-to-cart lab. The fly-to-cart target prefers the main nav link{" "}
        <code className="text-ui-fg-base">{NAV_CART_SELECTOR}</code> when present;
        the secondary button is a stand-in.
      </p>

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border border-dashed border-ui-border-base p-3 bg-ui-bg-subtle/50">
        <span className="text-sm text-ui-fg-muted">Demo cart target (fallback):</span>
        <button
          type="button"
          ref={demoCartRef}
          className="rounded border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-sm font-medium text-ui-fg-base"
          aria-label="Demo shopping cart"
        >
          Cart (0)
        </button>
      </div>
    </>
  )

  const sections = useMemo(
    () => [
      <LabSection
        key="btn-fly"
        title="1. Fly-to-cart"
        description="The storefront logo flies in a heart-shaped mask from the add button toward the cart. Uses Framer Motion, createPortal, and the nav cart when available."
      >
          <div className="flex flex-col gap-2">
            {flyHint && (
              <p className="text-sm text-emerald-700" role="status">
                Arrived at cart.
              </p>
            )}
            <FlyToCartButton
              demoCartRef={demoCartRef}
              onFlyComplete={() => {
                setFlyHint(true)
                window.setTimeout(() => setFlyHint(false), 1200)
              }}
            />
          </div>
        </LabSection>,

      <LabSection
          title="1 + 4. Fly-to-cart with tactile squish"
          description="The same cart flight as #1, but the trigger is a Framer Motion button with the spring whileTap from #4—press feedback and success motion in one control."
        >
          <div className="flex flex-col gap-2">
            {flyHintSquish && (
              <p className="text-sm text-emerald-700" role="status">
                Arrived at cart.
              </p>
            )}
            <FlyToCartButton
              withSquish
              demoCartRef={demoCartRef}
              onFlyComplete={() => {
                setFlyHintSquish(true)
                window.setTimeout(() => setFlyHintSquish(false), 1200)
              }}
            />
          </div>
        </LabSection>,

      <LabSection
          title="1 + 3 + 4 + 8. Fly, confetti, squish &amp; slot text"
          description="Pick a preset below to try different trail vs arrival combinations. Confetti uses heart shapes (`shapeFromPath`) so particles respect the greyscale or default color palette; if `Path2D` is unavailable they fall back to basic shapes. Spring squish (#4) and slot text (#8) are unchanged; re-triggers after the slot resets (~2s)."
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-ui-fg-base mb-2">
                Variant presets
              </p>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Fly combo variant"
              >
                {(Object.keys(FLY_COMBO_VARIANTS) as FlyComboVariantId[]).map(
                  (id) => {
                    const v = FLY_COMBO_VARIANTS[id]
                    const active = flyComboVariant === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFlyComboVariant(id)}
                        className={[
                          "rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                          active
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-ui-border-base bg-ui-bg-base text-ui-fg-base hover:bg-ui-bg-subtle",
                        ].join(" ")}
                      >
                        {v.label}
                      </button>
                    )
                  }
                )}
              </div>
              <p className="mt-2 text-xs text-ui-fg-muted max-w-3xl">
                {FLY_COMBO_VARIANTS[flyComboVariant].description}
              </p>
            </div>
            {flyHint138 && (
              <p className="text-sm text-emerald-700" role="status">
                Arrived at cart.
              </p>
            )}
            <FlyConfettiSquishSlotComboButton
              variant={flyComboVariant}
              demoCartRef={demoCartRef}
              onFlyComplete={() => {
                setFlyHint138(true)
                window.setTimeout(() => setFlyHint138(false), 1200)
              }}
            />
          </div>
        </LabSection>,

      <LabSection
          title="2. Morph &amp; success state"
          description="Loading state, then success color, checkmark, and copy that resets. Mirrors a typical add-to-cart flow with React state and Tailwind transitions."
        >
          <MorphAddButton />
        </LabSection>,

      <LabSection
          title="3. Confetti / sparkles"
          description="canvas-confetti burst from the button center. Works well for playful or celebratory brands."
        >
          <ConfettiAddButton />
        </LabSection>,

      <LabSection
          title="4. Tactile squish / bounce"
          description="whileTap scale with a spring for press feedback. Framer Motion makes this a few lines of code."
        >
          <SquishAddButton />
        </LabSection>,

      <LabSection
          title="5. Material-style ripple"
          description="Click coordinates seed an expanding ring inside an overflow-hidden button. Uses Framer Motion for the ripple (pure CSS is another valid approach)."
        >
          <RippleAddButton />
        </LabSection>,

      <LabSection
          title="6. Haptic feedback"
          description="navigator.vibrate for supported mobile browsers; wrapped in a capability check so desktop is unaffected."
        >
          <HapticAddButton />
        </LabSection>,

      <LabSection
          title="7. 3D coin flip"
          description="Front: Add to cart. Back: Added with icon. Framer Motion rotates on the X-axis with preserve-3d and hidden back-faces, similar to pure CSS 3D card flips."
        >
          <CoinFlip3DButton />
        </LabSection>,

      <LabSection
          title="8. Slot machine text roll"
          description="Fixed height, overflow hidden; the text column translates up on click so an Added! line slides into view. Typography-only feedback without a big color change."
        >
          <SlotMachineTextButton />
        </LabSection>,

      <LabSection
          title="9. Integrated progress fill"
          description="A darker layer creeps left-to-right, then the label flips to success—good when cart API can take a moment. Demo uses a 1.2s fill; wire width to a real request for production."
        >
          <ProgressFillButton />
        </LabSection>,

      <LabSection
          title="10. Glossy shimmer / sweep"
          description="A diagonal light beam crosses the button after each click, keyed so repeated clicks replay the sweep. Gradient overlay + Framer position animation (keyframes work too)."
        >
          <ShimmerSweepButton />
        </LabSection>,

      <LabSection
          title="11. Auditory feedback (earcon)"
          description="Subtle chime on click via the Web Audio API (no file). Mute the tab or your OS to compare. You can drop in use-sound and a very small /public sound for a custom earcon."
        >
          <EarconAddButton />
        </LabSection>,

      <LabSection
          title="12. Mini Tetris (easter egg)"
          description="A tiny client-side pass time while comparing interactions. The board, pieces, and controls use the same brand CSS variables and Medusa UI treatment as the rest of the test page. Focus the playfield for keyboard: arrows, X or up to rotate, Space or Enter to hard drop. Restart is always available."
        >
          <MiniTetris />
        </LabSection>,

      <LabSection
          title="13. Mini bubble pop (shooter)"
          description="Aim with the mouse, click to fire: wall-bounce, staggered grid, 3+ match (BFS), ceiling-connected orphan drop (flood), dashed aim line. Physics use 16 microsteps per frame and a looser contact radius; every 5th shot a new top row is inserted and the field shifts down—bubbles in the bottom row at that moment end the run."
        >
          <MiniBubblePop />
        </LabSection>,
    ],
    [
      LabSection,
      demoCartRef,
      flyHint,
      flyHintSquish,
      flyHint138,
      flyComboVariant,
    ]
  )

  return { chrome, sections }
}
