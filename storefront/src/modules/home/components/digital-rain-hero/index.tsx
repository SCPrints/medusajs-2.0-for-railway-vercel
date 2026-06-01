"use client"

import React, { useCallback, useEffect, useRef } from "react"

/**
 * DigitalRainHero — a colourful, blocky "digital rain" canvas animation.
 *
 * Vertical streams of small neon tiles cascade down a deep indigo→navy
 * gradient, like a vibrant, pixelated take on the Matrix rain. Each column is
 * independent (its own speed, spacing, hue, start delay); the brightest/largest
 * tile leads the stream and dimmer/smaller tiles trail behind it into faint
 * dots. Streams fade in near the top, fade out near the bottom, and respawn
 * continuously so the field never empties.
 *
 * Tuned for the SC Prints home hero: full-spectrum neon ("we print every
 * colour"), a DENSE field, but a CALM ambient drift at reduced opacity so the
 * headline + CTAs in <HeroOverlay> read cleanly on top.
 *
 * Rendering: a single Canvas 2D layer (DPR-capped), transparent over a CSS
 * gradient background. Pauses when scrolled offscreen (IntersectionObserver),
 * paints a static frame for prefers-reduced-motion, and defers its rAF loop to
 * idle so it never fights first paint / hydration. Mirrors the accessibility +
 * performance patterns from the space-hero it replaces.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
// Adjust these to retune the feel. CALM + DENSE + NEON is the chosen brief.
const TUNING = {
  // Column pitch (logical px). Smaller = denser. Scales down on small screens
  // for performance + legibility.
  cellDesktop: 16,
  cellTablet: 18,
  cellPhone: 22,
  // Fall speed range (logical px / second). Low = calm ambient drift.
  speedMin: 16,
  speedMax: 46,
  // Tiles per stream (head + trailing tail). Longer streams = taller colour
  // ribbons that fill the field vertically without needing more speed — this is
  // the main lever for a "dense" look while keeping a calm fall.
  lengthMin: 10,
  lengthMax: 30,
  // Head tile size as a fraction of the column cell (varies per stream so some
  // columns lead with chunky blocks, others with smaller tiles).
  headScaleMin: 0.5,
  headScaleMax: 0.92,
  // Global opacity multiplier for the whole rain layer. Lower = the rain reads
  // as an ambient backdrop and the overlaid text wins.
  rainAlpha: 0.56,
  // Respawn hold after a stream exits the bottom (ms). Mostly short to keep the
  // field dense; an occasional longer hold creates organic gaps.
  respawnMinMs: 90,
  respawnMaxMs: 800,
  longGapChance: 0.08,
  longGapMaxMs: 2600,
} as const

// Background gradient: indigo/purple at the top → near-black navy at the bottom.
// Bottom stop ≈ the hero section's #0B0C10 so the two blend seamlessly.
const BG_GRADIENT =
  "linear-gradient(180deg, #2a1c4d 0%, #20183c 24%, #16142b 52%, #0d0c1c 78%, #0a0a14 100%)"

// ─── Stream model ───────────────────────────────────────────────────────────
interface Stream {
  baseX: number // logical column centre (stable across respawns)
  x: number // logical centre x (column centre + slight jitter)
  headY: number // logical y of the head (leading, bottom-most tile)
  speed: number // px / second
  length: number // tile count
  gap: number // vertical px between tiles
  headSize: number // px — size of the head (largest) tile
  hue: number // base hue 0..360 (full-spectrum neon)
  hueSeed: number // phase for gentle per-tile hue drift
  tallChance: number // per-stream chance a tile renders as a tall block vs square
  active: boolean
  holdMs: number // ms remaining before (re)spawn while inactive
}

// ─── Math helpers ─────────────────────────────────────────────────────────────
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)

function cellForWidth(w: number): number {
  if (w < 640) return TUNING.cellPhone
  if (w < 1024) return TUNING.cellTablet
  return TUNING.cellDesktop
}

// Pick fresh randomised parameters for a stream. `initial` distributes headY
// across the full height so the field is already full on the first frame;
// otherwise the stream spawns above the top edge and falls in.
function rollStream(baseX: number, cell: number, h: number, initial: boolean): Stream {
  const length = Math.round(rand(TUNING.lengthMin, TUNING.lengthMax))
  const gap = cell * rand(0.7, 1.1)
  const headSize = Math.max(
    3,
    Math.round(cell * rand(TUNING.headScaleMin, TUNING.headScaleMax))
  )
  const span = length * gap
  const headY = initial
    ? rand(-span, h + span)
    : -rand(gap * 1.5, span) // spawn above the top; tail trails off-screen
  return {
    baseX,
    x: baseX + rand(-cell * 0.18, cell * 0.18), // loose, non-grid columns
    headY,
    speed: rand(TUNING.speedMin, TUNING.speedMax),
    length,
    gap,
    headSize,
    hue: Math.random() * 360,
    hueSeed: Math.random() * Math.PI * 2,
    tallChance: rand(0.1, 0.4),
    active: true,
    holdMs: 0,
  }
}

function buildStreams(w: number, h: number): { streams: Stream[]; cell: number } {
  const cell = cellForWidth(w)
  const cols = Math.max(1, Math.floor(w / cell))
  // Centre the grid so there's no bias toward the left edge.
  const offset = (w - cols * cell) / 2 + cell / 2
  const streams: Stream[] = []
  for (let i = 0; i < cols; i++) {
    streams.push(rollStream(offset + i * cell, cell, h, true))
  }
  return { streams, cell }
}

// ─── Update ─────────────────────────────────────────────────────────────────
function updateStreams(streams: Stream[], dtMs: number, cell: number, h: number) {
  for (const s of streams) {
    if (!s.active) {
      s.holdMs -= dtMs
      if (s.holdMs <= 0) {
        Object.assign(s, rollStream(s.baseX, cell, h, false))
      }
      continue
    }
    s.headY += (s.speed * dtMs) / 1000
    // Stream is done once its highest (last) tile has cleared the bottom.
    const tailTopY = s.headY - (s.length - 1) * s.gap
    if (tailTopY > h + s.headSize) {
      s.active = false
      const longGap = Math.random() < TUNING.longGapChance
      s.holdMs = longGap
        ? rand(TUNING.respawnMaxMs, TUNING.longGapMaxMs)
        : rand(TUNING.respawnMinMs, TUNING.respawnMaxMs)
    }
  }
}

// ─── T-shirt silhouette ───────────────────────────────────────────────────────
// Draws a filled t-shirt shape centered at (cx, cy) sized to ~size px.
// Proportions are tuned to stay readable at 8–18 px.
function drawTshirt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const bw = size * 0.48   // body half-width
  const ht = size * 0.56   // half-height (shirt taller than wide)
  const sw = size * 0.30   // sleeve horizontal extension each side
  const sd = size * 0.28   // sleeve vertical drop
  const nw = size * 0.17   // half-neck width
  const nd = size * 0.15   // neck curve depth

  const top = cy - ht
  const bot = cy + ht

  ctx.beginPath()
  ctx.moveTo(cx - bw - sw, top)                                       // top-left sleeve outer
  ctx.lineTo(cx - bw,      top)                                       // sleeve → left shoulder
  ctx.lineTo(cx - nw,      top)                                       // shoulder → neck left
  ctx.quadraticCurveTo(cx, top + nd, cx + nw, top)                   // neck curve
  ctx.lineTo(cx + bw,      top)                                       // neck right → right shoulder
  ctx.lineTo(cx + bw + sw, top)                                       // shoulder → sleeve top outer
  ctx.lineTo(cx + bw + sw, top + sd)                                  // sleeve outer right edge
  ctx.lineTo(cx + bw,      top + sd)                                  // sleeve bottom → body top-right
  ctx.lineTo(cx + bw,      bot)                                       // right body side
  ctx.lineTo(cx - bw,      bot)                                       // bottom hem
  ctx.lineTo(cx - bw,      top + sd)                                  // left body side up
  ctx.lineTo(cx - bw - sw, top + sd)                                  // body left → sleeve bottom
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
// Two passes: a soft additive "bloom" behind the bright leading tiles for the
// neon glow, then the crisp blocky tiles on top. The leading (head) tile of
// each stream is drawn as a t-shirt silhouette instead of a rectangle.
function drawStreams(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  streams: Stream[]
) {
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false

  const fadeIn = h * 0.14
  const fadeOut = h * 0.22

  // ── Pass 1: bloom halos behind the head + first couple of tiles (additive) ──
  ctx.globalCompositeOperation = "lighter"
  for (const s of streams) {
    if (!s.active) continue
    const bloomTiles = Math.min(3, s.length)
    for (let i = 0; i < bloomTiles; i++) {
      const y = s.headY - i * s.gap
      if (y < -s.headSize || y > h + s.headSize) continue
      const frac = s.length > 1 ? i / (s.length - 1) : 0
      const size = lerp(s.headSize, s.headSize * 0.4, frac)
      const env = clamp01(y / fadeIn) * clamp01((h - y) / fadeOut)
      const a = (1 - frac) * 0.5 * env * TUNING.rainAlpha
      if (a <= 0.01) continue
      const hue = s.hue + Math.sin(i * 0.7 + s.hueSeed) * 10
      // Head tile gets a larger bloom to match the bigger t-shirt silhouette.
      const bloom = i === 0 ? size * 5.5 : size * 2.1
      ctx.fillStyle = `hsla(${hue}, 100%, 62%, ${a})`
      ctx.fillRect(
        Math.round(s.x - bloom / 2),
        Math.round(y - bloom / 2),
        Math.round(bloom),
        Math.round(bloom)
      )
    }
  }

  // ── Pass 2: crisp blocky tiles, head → tail (brightest/largest → faint dots) ──
  ctx.globalCompositeOperation = "source-over"
  for (const s of streams) {
    if (!s.active) continue
    for (let i = 0; i < s.length; i++) {
      const y = s.headY - i * s.gap
      if (y < -s.headSize || y > h + s.headSize) continue
      const frac = s.length > 1 ? i / (s.length - 1) : 0

      // Size shrinks toward the tail into small dots (ease-in so most of the
      // tail stays visible and only the far end pinches to dots).
      const size = Math.max(2, lerp(s.headSize, Math.max(2, s.headSize * 0.16), frac * frac))

      // Head bright + saturated; tail dims and desaturates a touch.
      const light = lerp(66, 46, frac)
      const sat = lerp(96, 72, frac)
      const hue = s.hue + Math.sin(i * 0.7 + s.hueSeed) * 10

      // Alpha: tail fade × top/bottom envelope × global ambient dimming.
      const env = clamp01(y / fadeIn) * clamp01((h - y) / fadeOut)
      const tail = Math.pow(1 - frac, 0.85)
      const a = clamp01(tail) * env * TUNING.rainAlpha
      if (a <= 0.012) continue

      const color = `hsla(${hue}, ${sat}%, ${light}%, ${a})`

      // Head tile → t-shirt silhouette (above a minimum size so tiny heads
      // don't produce unreadable smears at the threshold boundary).
      if (i === 0 && size >= 6) {
        // Scale up 2.5× so the t-shirt is clearly readable at stream head scale.
        drawTshirt(ctx, Math.round(s.x), Math.round(y), size * 2.5, color)
        continue
      }

      // Trailing tiles: blocky rects with occasional tall blocks.
      let dw = size
      let dh = size
      if (frac < 0.55 && Math.sin(i * 1.3 + s.hueSeed * 2) > 1 - s.tallChance * 2) {
        dh = size * 1.7
      }

      ctx.fillStyle = color
      ctx.fillRect(
        Math.round(s.x - dw / 2),
        Math.round(y - dh / 2),
        Math.max(2, Math.round(dw)),
        Math.max(2, Math.round(dh))
      )
    }
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────
type Props = { className?: string; style?: React.CSSProperties }

export default function DigitalRainHero({ className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const streamsRef = useRef<Stream[]>([])
  const cellRef = useRef<number>(TUNING.cellDesktop)
  const lastRef = useRef<number>(0)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 })

  // Size the canvas to its parent in device pixels (DPR capped at 2 so high-DPR
  // phones don't pay a 3× fill cost) and return the logical dimensions.
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return null
    const w = wrap.clientWidth || window.innerWidth
    const h = wrap.clientHeight || window.innerHeight
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext("2d")
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    sizeRef.current = { w, h, dpr }
    return { w, h }
  }, [])

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const tick = (now: number) => {
      const { w, h } = sizeRef.current
      if (!pausedRef.current && w > 0 && h > 0) {
        let dt = now - lastRef.current
        // Clamp so a backgrounded tab / GC pause doesn't teleport the field.
        if (dt > 60) dt = 60
        if (dt < 0) dt = 0
        updateStreams(streamsRef.current, dt, cellRef.current, h)
        drawStreams(ctx, w, h, streamsRef.current)
      }
      lastRef.current = now
      rafRef.current = requestAnimationFrame(tick)
    }
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dims = resize()
    if (!dims) return
    const built = buildStreams(dims.w, dims.h)
    streamsRef.current = built.streams
    cellRef.current = built.cell

    const ctx = canvas.getContext("2d")
    // Paint one static frame immediately so the hero is never an empty panel
    // before the loop starts (and this is the full reduced-motion fallback).
    if (ctx) drawStreams(ctx, dims.w, dims.h, streamsRef.current)

    let reducedMotion = false
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      reducedMotion = false
    }

    // Debounced resize: rebuild the column field to the new width.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const d = resize()
        if (!d) return
        const rebuilt = buildStreams(d.w, d.h)
        streamsRef.current = rebuilt.streams
        cellRef.current = rebuilt.cell
        const c = canvasRef.current?.getContext("2d")
        if (c && (reducedMotion || pausedRef.current)) drawStreams(c, d.w, d.h, streamsRef.current)
      }, 180)
    }
    window.addEventListener("resize", onResize, { passive: true })

    if (reducedMotion) {
      return () => {
        window.removeEventListener("resize", onResize)
        if (resizeTimer) clearTimeout(resizeTimer)
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        pausedRef.current = !entry.isIntersecting
      },
      { threshold: 0 }
    )
    observer.observe(canvas)

    // Defer the rAF loop to idle so the pixel churn doesn't fight first paint /
    // hydration / Lighthouse Speed Index. The static frame above is already up.
    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    type Ric = (cb: () => void, opts?: { timeout?: number }) => number
    const ric = (window as unknown as { requestIdleCallback?: Ric }).requestIdleCallback
    if (typeof ric === "function") {
      idleHandle = ric(() => runLoop(), { timeout: 2000 })
    } else {
      timeoutHandle = setTimeout(() => runLoop(), 1200)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
      window.removeEventListener("resize", onResize)
      if (resizeTimer) clearTimeout(resizeTimer)
      if (idleHandle !== null) {
        const cancelRic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback
        if (typeof cancelRic === "function") cancelRic(idleHandle)
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }, [resize, runLoop])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "600px",
        overflow: "hidden",
        background: BG_GRADIENT,
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />
      {/* Vignette: subtle corner darkening to frame the centre + add depth, and
          gently push the bright tiles back behind the overlaid text. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 42%, transparent 46%, rgba(8,8,18,0.55) 100%)",
        }}
      />
    </div>
  )
}
