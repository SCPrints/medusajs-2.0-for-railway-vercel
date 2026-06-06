"use client"

import React, { useCallback, useEffect, useRef } from "react"

/**
 * EmbroideryStitchHero — the SC Prints wordmark stitched in thread, satin
 * stitch by satin stitch, onto a woven fabric surface inside an embroidery hoop.
 *
 * WHAT IT SHOWS
 * -------------
 * A deep-navy fabric (fine twill cross-hatch + low noise) framed by a two-ring
 * embroidery hoop with a tension screw at the top. The logo alpha is sampled
 * into a coverage grid, then scanned in horizontal ROWS. Within each covered run
 * we lay short SATIN stitches across the run — every stitch is a thread-coloured
 * capsule with a bright sheen highlight on one edge and a darker edge on the
 * other, so it reads as RAISED 3D thread. The stitch angle alternates slightly
 * row-to-row for the zig-zag satin look. Thread colour flows through the brand
 * palette (teal → magenta → navy) across the art so the mark reads colourful.
 *
 * HOW IT ANIMATES / LOOPS  (~12.5s cycle)
 * ---------------------------------------
 *   1. STITCHING  — stitches reveal in a plausible sewing order (boustrophedon:
 *      rows alternate left→right then right→left) at a machine cadence scaled to
 *      the total count. A NEEDLE indicator (needle + thread tail from an
 *      off-frame spool) bobs up/down at the current stitch head with a tiny
 *      tension wobble; a faint thread line trails spool → needle.
 *   2. FINISH/HOLD — once fully stitched, hold ~2.5s while a SPECULAR HIGHLIGHT
 *      rakes across the satin so the sheen shifts — the "this is embroidery"
 *      beat.
 *   3. SNIP + DISSOLVE — stitches fade out (a quick thread "snip" flash), then
 *      the cycle resets and re-stitches. Graceful, seamless loop.
 *
 * INTERACTIVITY
 * -------------
 * The satin SHEEN/specular direction follows the cursor: moving the mouse over
 * the panel changes which edge of each stitch catches the light, so the whole
 * mark glints toward the pointer. Defaults to a slow auto-rake until first move.
 *
 * RENDERING
 * ---------
 * Single Canvas 2D layer (DPR-capped at 2). Stitch geometry is precomputed ONCE
 * per size (re-run on resize); per frame we only advance the reveal index, the
 * sheen angle and the needle bob. Pauses offscreen (IntersectionObserver),
 * paints a static finished frame for prefers-reduced-motion, and defers its rAF
 * loop to idle so it never fights first paint / hydration. Same accessibility +
 * performance patterns as digital-rain-hero.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
const TUNING = {
  // Coverage sampling: the logo alpha is rasterised into a grid of cells of this
  // pitch (logical px). Smaller = finer rows = more stitches. Tuned per device
  // so the stitch count lands in the ~1200–2600 target on every screen.
  rowPitchDesktop: 7,
  rowPitchTablet: 8,
  rowPitchPhone: 10,
  alphaThreshold: 40, // px counts as "ink" when its alpha > this
  // Satin stitch geometry.
  stitchSpacing: 6, // logical px between consecutive stitches along a run
  stitchHalfLenMin: 3.2, // half the stitch length (across the run) — thin runs
  stitchHalfLenMax: 5.0, // — thick runs
  stitchWidth: 3.0, // capsule thickness (the visual "thread gauge")
  zigzag: 0.22, // row-to-row stitch-angle alternation, radians
  hardCap: 3000, // absolute ceiling on stitch primitives (perf guard)
  // Sewing cadence (stitches revealed per second). Scaled so total stitch-time
  // is roughly constant regardless of count.
  stitchSeconds: 7.0, // time to lay the whole mark
  holdSeconds: 2.6, // specular-rake hold once finished
  dissolveSeconds: 0.9, // snip + fade-out
  gapSeconds: 0.5, // brief blank before re-stitch
  // Logo box as a fraction of the smaller panel dimension (leaves room for hoop).
  logoFrac: 0.62,
} as const

// Fabric background: deep navy weave so bright thread pops.
const FABRIC_BASE = "#20203a"
const FABRIC_DARK = "#191930"
const FABRIC_LIGHT = "#27274a"

// Brand thread palette — stitch colour lerps through these left→right across art.
const THREAD_STOPS: Array<[number, number, number]> = [
  [0x3d, 0xcf, 0xc2], // teal   #3dcfc2
  [0xff, 0x2e, 0x63], // magenta #ff2e63
  [0x6a, 0x5a, 0xd6], // a violet bridge so navy doesn't read as a dead patch
  [0x1a, 0x1a, 0x2e], // navy   #1a1a2e  (kept lifted by sheen, never flat black)
]

// ─── Math helpers ─────────────────────────────────────────────────────────────
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

function rowPitchForWidth(w: number): number {
  if (w < 640) return TUNING.rowPitchPhone
  if (w < 1024) return TUNING.rowPitchTablet
  return TUNING.rowPitchDesktop
}

// Sample the brand thread gradient at t in [0,1] → "r,g,b" components.
function threadColor(t: number): [number, number, number] {
  const n = THREAD_STOPS.length - 1
  const x = clamp01(t) * n
  const i = Math.min(n - 1, Math.floor(x))
  const f = x - i
  const a = THREAD_STOPS[i]
  const b = THREAD_STOPS[i + 1]
  return [
    Math.round(lerp(a[0], b[0], f)),
    Math.round(lerp(a[1], b[1], f)),
    Math.round(lerp(a[2], b[2], f)),
  ]
}

// ─── Stitch model ───────────────────────────────────────────────────────────
interface Stitch {
  cx: number // centre x (logical px)
  cy: number // centre y (logical px)
  ang: number // stitch long-axis angle (radians) — direction the thread runs
  half: number // half stitch length along its axis
  r: number // base thread colour
  g: number
  b: number
}

interface Geometry {
  stitches: Stitch[]
  box: { x: number; y: number; w: number; h: number } // logo bounding box
  hoop: { cx: number; cy: number; r: number } // hoop ring (logical px)
}

// ─── Geometry build (runs once per size) ────────────────────────────────────
// Draw the logo "contain"-fitted into an offscreen canvas, read alpha, then scan
// row-by-row laying satin stitches across each covered horizontal run. Returns
// stitches ordered as a plausible boustrophedon sewing path.
function buildGeometry(
  img: HTMLImageElement,
  w: number,
  h: number
): Geometry | null {
  if (!img.width || !img.height || w <= 0 || h <= 0) return null

  const minDim = Math.min(w, h)
  const boxMax = minDim * TUNING.logoFrac
  const aspect = img.width / img.height
  let bw = boxMax
  let bh = boxMax
  if (aspect >= 1) bh = boxMax / aspect
  else bw = boxMax * aspect
  const boxX = (w - bw) / 2
  const boxY = (h - bh) / 2

  // Offscreen alpha raster at the on-screen box size (no DPR — geometry is in
  // logical px). Cap raster area so huge panels don't allocate absurd buffers.
  const rw = Math.max(2, Math.min(900, Math.round(bw)))
  const rh = Math.max(2, Math.min(900, Math.round(bh)))
  const off = document.createElement("canvas")
  off.width = rw
  off.height = rh
  const offCtx = off.getContext("2d", { willReadFrequently: true })
  if (!offCtx) return null
  offCtx.clearRect(0, 0, rw, rh)
  offCtx.drawImage(img, 0, 0, rw, rh)

  let data: Uint8ClampedArray
  try {
    data = offCtx.getImageData(0, 0, rw, rh).data
  } catch {
    return null // tainted (shouldn't happen same-origin) — bail to bg-only
  }

  const sx = bw / rw // raster→logical x scale
  const sy = bh / rh
  const pitch = rowPitchForWidth(w)
  const rowsPx = Math.max(2, Math.round(pitch / sy)) // raster rows per stitch row

  const stitches: Stitch[] = []
  const alphaAt = (px: number, py: number) =>
    data[(py * rw + px) * 4 + 3]

  let rowIndex = 0
  for (let ry = 0; ry < rh; ry += rowsPx) {
    const sampleY = Math.min(rh - 1, ry + (rowsPx >> 1))
    const ltr = rowIndex % 2 === 0 // boustrophedon: even rows L→R, odd R→L
    const ang = Math.PI / 2 + (rowIndex % 2 === 0 ? TUNING.zigzag : -TUNING.zigzag)

    // Walk the raster row, finding contiguous covered runs.
    const runs: Array<[number, number]> = []
    let runStart = -1
    for (let px = 0; px < rw; px++) {
      const covered = alphaAt(px, sampleY) > TUNING.alphaThreshold
      if (covered && runStart < 0) runStart = px
      else if (!covered && runStart >= 0) {
        runs.push([runStart, px - 1])
        runStart = -1
      }
    }
    if (runStart >= 0) runs.push([runStart, rw - 1])

    // Order runs in the sewing direction for this row.
    if (!ltr) runs.reverse()

    for (const [a, bEnd] of runs) {
      const runLenPx = (bEnd - a + 1) * sx
      // Stitch length adapts to run thickness so thin strokes get short stitches.
      const half = lerp(
        TUNING.stitchHalfLenMin,
        TUNING.stitchHalfLenMax,
        clamp01((runLenPx - 4) / 40)
      )
      const stepPx = Math.max(1, Math.round(TUNING.stitchSpacing / sx))
      const from = ltr ? a : bEnd
      const to = ltr ? bEnd : a
      const dir = ltr ? 1 : -1
      for (let px = from; dir > 0 ? px <= to : px >= to; px += dir * stepPx) {
        const cx = boxX + (px + 0.5) * sx
        const cy = boxY + (ry + rowsPx * 0.5) * sy
        // Colour by horizontal position through the whole art (teal→navy).
        const t = (px / rw) * 0.85 + (ry / rh) * 0.15
        const [r, g, b] = threadColor(t)
        stitches.push({ cx, cy, ang, half, r, g, b })
        if (stitches.length >= TUNING.hardCap) break
      }
      if (stitches.length >= TUNING.hardCap) break
    }
    if (stitches.length >= TUNING.hardCap) break
    rowIndex++
  }

  const hoopR = minDim * 0.46
  return {
    stitches,
    box: { x: boxX, y: boxY, w: bw, h: bh },
    hoop: { cx: w / 2, cy: h / 2, r: hoopR },
  }
}

// ─── Fabric + hoop (static layer, painted each frame under the stitches) ──────
function drawFabric(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hoop: Geometry["hoop"]
) {
  // Base.
  ctx.fillStyle = FABRIC_BASE
  ctx.fillRect(0, 0, w, h)

  // Soft centre lift so the hooped area reads brighter than the corners.
  const g = ctx.createRadialGradient(
    hoop.cx,
    hoop.cy,
    hoop.r * 0.1,
    hoop.cx,
    hoop.cy,
    hoop.r * 1.7
  )
  g.addColorStop(0, "rgba(60,60,110,0.35)")
  g.addColorStop(1, "rgba(0,0,0,0.0)")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // Twill weave: two families of fine diagonal lines (cross-hatch) — cheap,
  // crisp, and reads as woven cloth. Clipped to the hoop interior so it doesn't
  // bleed onto the frame.
  ctx.save()
  ctx.beginPath()
  ctx.arc(hoop.cx, hoop.cy, hoop.r - 6, 0, Math.PI * 2)
  ctx.clip()

  const step = 6
  const diag = w + h
  ctx.lineWidth = 1
  ctx.strokeStyle = "rgba(255,255,255,0.035)"
  ctx.beginPath()
  for (let d = -h; d < w; d += step) {
    ctx.moveTo(d, 0)
    ctx.lineTo(d + h, h)
  }
  ctx.stroke()
  ctx.strokeStyle = "rgba(0,0,0,0.10)"
  ctx.beginPath()
  for (let d = 0; d < diag; d += step) {
    ctx.moveTo(d, 0)
    ctx.lineTo(d - h, h)
  }
  ctx.stroke()
  ctx.restore()

  // Embroidery hoop: outer wooden ring, inner ring, subtle shadow, tension screw.
  // Outer ring drop shadow.
  ctx.save()
  ctx.beginPath()
  ctx.arc(hoop.cx, hoop.cy + 4, hoop.r + 13, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(0,0,0,0.30)"
  ctx.fill()
  ctx.restore()

  const ringW = Math.max(9, hoop.r * 0.05)
  // Outer ring with a light-from-top gradient for a turned-wood look.
  const wood = ctx.createLinearGradient(0, hoop.cy - hoop.r, 0, hoop.cy + hoop.r)
  wood.addColorStop(0, "#caa46a")
  wood.addColorStop(0.5, "#9c7a48")
  wood.addColorStop(1, "#6e5530")
  ctx.lineWidth = ringW
  ctx.strokeStyle = wood
  ctx.beginPath()
  ctx.arc(hoop.cx, hoop.cy, hoop.r + ringW * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  // Inner ring (thinner, slightly darker) — the cloth is pinched between them.
  ctx.lineWidth = Math.max(4, ringW * 0.5)
  ctx.strokeStyle = "rgba(40,30,18,0.55)"
  ctx.beginPath()
  ctx.arc(hoop.cx, hoop.cy, hoop.r - 4, 0, Math.PI * 2)
  ctx.stroke()
  // Inner highlight bead.
  ctx.lineWidth = 1.5
  ctx.strokeStyle = "rgba(255,240,210,0.25)"
  ctx.beginPath()
  ctx.arc(hoop.cx, hoop.cy, hoop.r - 2, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()

  // Tension screw / bracket at the top of the hoop.
  const screwY = hoop.cy - hoop.r - ringW * 0.5
  ctx.fillStyle = "#b9bcc4"
  ctx.strokeStyle = "rgba(0,0,0,0.35)"
  ctx.lineWidth = 1
  const bw2 = ringW * 1.4
  const bh2 = ringW * 1.7
  ctx.beginPath()
  ctx.rect(hoop.cx - bw2, screwY - bh2 * 0.4, bw2 * 2, bh2)
  ctx.fill()
  ctx.stroke()
  // Two screw heads.
  for (const dx of [-bw2 * 0.5, bw2 * 0.5]) {
    ctx.beginPath()
    ctx.arc(hoop.cx + dx, screwY + bh2 * 0.1, bh2 * 0.22, 0, Math.PI * 2)
    ctx.fillStyle = "#8a8d95"
    ctx.fill()
    ctx.strokeStyle = "rgba(0,0,0,0.4)"
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(hoop.cx + dx - bh2 * 0.16, screwY + bh2 * 0.1)
    ctx.lineTo(hoop.cx + dx + bh2 * 0.16, screwY + bh2 * 0.1)
    ctx.strokeStyle = "rgba(0,0,0,0.45)"
    ctx.stroke()
  }
}

// ─── Stitch rendering ─────────────────────────────────────────────────────────
// Each satin stitch is a thread capsule drawn as a thick rounded line, plus a
// bright sheen bead on the light-facing edge and a dark bead on the opposite
// edge → reads as raised 3D thread. `sheenDir` is the global light direction
// (radians); a stitch glints brightest when its long axis is broadside to it.
function drawStitch(
  ctx: CanvasRenderingContext2D,
  s: Stitch,
  appear: number, // 0..1 — pop-in scale for the most-recently-laid stitches
  sheenDir: number,
  alpha: number // global layer alpha (for dissolve)
) {
  const dx = Math.cos(s.ang)
  const dy = Math.sin(s.ang)
  const half = s.half * (0.55 + 0.45 * appear) // grow slightly as it "lands"
  const x0 = s.cx - dx * half
  const y0 = s.cy - dy * half
  const x1 = s.cx + dx * half
  const y1 = s.cy + dy * half

  // The stitch's surface normal (perpendicular to its axis).
  const nx = -dy
  const ny = dx
  // How much this stitch faces the light: dot(normal, lightDir) → -1..1.
  const lx = Math.cos(sheenDir)
  const ly = Math.sin(sheenDir)
  const facing = nx * lx + ny * ly // -1..1
  const sheen = clamp01(facing) // only the lit edge brightens
  const shade = clamp01(-facing) // opposite edge darkens

  const baseA = alpha * (0.55 + 0.45 * appear)

  // 1) Dark underside bead — offset toward the shaded edge.
  if (shade > 0.02) {
    const o = TUNING.stitchWidth * 0.42
    ctx.strokeStyle = `rgba(0,0,0,${(0.18 + 0.32 * shade) * baseA})`
    ctx.lineWidth = TUNING.stitchWidth
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(x0 - nx * o, y0 - ny * o)
    ctx.lineTo(x1 - nx * o, y1 - ny * o)
    ctx.stroke()
  }

  // 2) Core thread capsule.
  ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${baseA})`
  ctx.lineWidth = TUNING.stitchWidth
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()

  // 3) Bright sheen bead — a thin highlight offset toward the lit edge, lifted
  // toward white by the facing factor. This is the "satin glint".
  const hl = 0.25 + 0.75 * sheen
  const hr = Math.round(lerp(s.r, 255, 0.55 * hl))
  const hg = Math.round(lerp(s.g, 255, 0.55 * hl))
  const hb = Math.round(lerp(s.b, 255, 0.55 * hl))
  const o2 = TUNING.stitchWidth * 0.34
  ctx.strokeStyle = `rgba(${hr},${hg},${hb},${(0.22 + 0.55 * sheen) * baseA})`
  ctx.lineWidth = Math.max(1, TUNING.stitchWidth * 0.42)
  ctx.beginPath()
  ctx.moveTo(x0 + nx * o2, y0 + ny * o2)
  ctx.lineTo(x1 + nx * o2, y1 + ny * o2)
  ctx.stroke()
}

// ─── Needle + spool (drawn at the live stitch head while sewing) ──────────────
function drawNeedle(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  bob: number, // 0..1 needle vertical bob (1 = needle up, 0 = needle plunged)
  w: number
) {
  // Spool sits off the top-left frame; thread runs from spool to the needle eye.
  const spoolX = w * 0.12
  const spoolY = -30

  // Slack thread spool→needle (a soft quadratic sag).
  ctx.strokeStyle = "rgba(255,255,255,0.22)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(spoolX, spoolY)
  const midX = (spoolX + hx) / 2
  const midY = (spoolY + hy) / 2 + 26
  ctx.quadraticCurveTo(midX, midY, hx, hy - 14)
  ctx.stroke()

  // Needle bar: a vertical chrome needle that bobs up (bob→1) / down (bob→0).
  const lift = (1 - bob) * -10 // plunged = lower
  const needleTop = hy - 46 + lift
  const needleTip = hy - 2 + lift
  const grad = ctx.createLinearGradient(hx - 2, 0, hx + 2, 0)
  grad.addColorStop(0, "#8d9098")
  grad.addColorStop(0.5, "#eef0f4")
  grad.addColorStop(1, "#8d9098")
  ctx.strokeStyle = grad
  ctx.lineWidth = 3
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(hx, needleTop)
  ctx.lineTo(hx, needleTip)
  ctx.stroke()
  // Needle eye + a glint.
  ctx.strokeStyle = "rgba(20,20,30,0.7)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(hx, needleTop + 8, 1.6, 3, 0, 0, Math.PI * 2)
  ctx.stroke()
}

// ─── Component ─────────────────────────────────────────────────────────────────
type Props = { className?: string; style?: React.CSSProperties }
type Phase = "stitch" | "hold" | "dissolve"

const LOGO_SRC = "/branding/sc-prints-logo-white-transparent.png"

export default function EmbroideryStitchHero({ className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 })

  const imgRef = useRef<HTMLImageElement | null>(null)
  const readyRef = useRef(false)
  const geoRef = useRef<Geometry | null>(null)
  const lastRef = useRef<number>(0)

  // Animation clock (seconds within the current cycle) + derived phase.
  const tRef = useRef(0)
  // Mouse light direction (radians). Null = no pointer yet → auto-rake.
  const mouseRef = useRef<{ x: number; y: number } | null>(null)

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

  // Rebuild stitch geometry for the current size (no-op until the image loads).
  const rebuildGeometry = useCallback(() => {
    const img = imgRef.current
    const { w, h } = sizeRef.current
    if (!readyRef.current || !img || w <= 0 || h <= 0) return
    geoRef.current = buildGeometry(img, w, h)
  }, [])

  // Resolve the global light direction (radians) from the mouse, or a slow
  // auto-rake from the clock when the pointer hasn't moved.
  const sheenDirFor = useCallback((t: number) => {
    const { w, h } = sizeRef.current
    const m = mouseRef.current
    if (m && w > 0 && h > 0) {
      // Light points FROM the centre TOWARD the cursor → mark glints that way.
      return Math.atan2(m.y - h / 2, m.x - w / 2)
    }
    return -Math.PI / 2 + Math.sin(t * 0.6) * 0.9 // gentle top-ish sweep
  }, [])

  // Render one full frame for the given cycle-time t (seconds). Pure of rAF so
  // it doubles as the static / reduced-motion painter.
  const renderFrame = useCallback(
    (t: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const { w, h } = sizeRef.current
      if (w <= 0 || h <= 0) return

      const geo = geoRef.current
      // Background-only until geometry is ready (image not yet loaded).
      if (!geo || geo.stitches.length === 0) {
        const fallbackHoop = { cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.46 }
        drawFabric(ctx, w, h, fallbackHoop)
        return
      }

      drawFabric(ctx, w, h, geo.hoop)

      const total = geo.stitches.length
      const cadence = total / TUNING.stitchSeconds // stitches / sec
      const sheenDir = sheenDirFor(t)

      // Phase boundaries on the cycle clock.
      const stitchEnd = TUNING.stitchSeconds
      const holdEnd = stitchEnd + TUNING.holdSeconds
      const dissolveEnd = holdEnd + TUNING.dissolveSeconds

      let phase: Phase = "stitch"
      if (t >= holdEnd) phase = "dissolve"
      else if (t >= stitchEnd) phase = "hold"

      // How many stitches are visible + global layer alpha (for the dissolve).
      let revealCount = total
      let layerAlpha = 1
      let sewing = false
      if (phase === "stitch") {
        revealCount = Math.min(total, Math.floor(t * cadence))
        sewing = revealCount < total
      } else if (phase === "dissolve") {
        const d = clamp01((t - holdEnd) / TUNING.dissolveSeconds)
        layerAlpha = 1 - easeInOut(d)
      }

      // During the HOLD, push extra sheen energy through a moving rake band so
      // the specular highlight visibly sweeps across the satin.
      let rakeCenter = -1
      if (phase === "hold") {
        const hp = clamp01((t - stitchEnd) / TUNING.holdSeconds)
        rakeCenter = geo.box.x + hp * (geo.box.w + geo.box.w * 0.2) - geo.box.w * 0.1
      }

      ctx.save()
      for (let i = 0; i < revealCount; i++) {
        const s = geo.stitches[i]
        // "appear" pops the newest few stitches in over ~0.12s of reveal.
        let appear = 1
        if (sewing) {
          const age = (revealCount - i) // 0 = just laid
          appear = clamp01(age / 6)
        }
        // Local sheen boost when the moving rake band passes over this stitch.
        let localSheen = sheenDir
        let extra = 0
        if (rakeCenter >= 0) {
          const dist = Math.abs(s.cx - rakeCenter)
          extra = Math.max(0, 1 - dist / (geo.box.w * 0.16))
        }
        drawStitch(ctx, s, appear, localSheen, layerAlpha)
        // Add a white rake glint on top of stitches inside the band.
        if (extra > 0.02) {
          const dxv = Math.cos(s.ang)
          const dyv = Math.sin(s.ang)
          const nxv = -dyv
          const nyv = dxv
          const o = TUNING.stitchWidth * 0.32
          ctx.strokeStyle = `rgba(255,255,255,${0.5 * extra * layerAlpha})`
          ctx.lineWidth = Math.max(1, TUNING.stitchWidth * 0.4)
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.moveTo(s.cx - dxv * s.half + nxv * o, s.cy - dyv * s.half + nyv * o)
          ctx.lineTo(s.cx + dxv * s.half + nxv * o, s.cy + dyv * s.half + nyv * o)
          ctx.stroke()
        }
      }
      ctx.restore()

      // Needle + spool while actively sewing.
      if (sewing && revealCount > 0) {
        const head = geo.stitches[Math.min(total - 1, revealCount)]
        // Bob from the fractional progress between stitches + a tension wobble.
        const frac = (t * cadence) % 1
        const bob = 0.5 + 0.5 * Math.sin(frac * Math.PI * 2)
        const wobbleX = Math.sin(t * 47) * 1.2 // fast machine vibration
        drawNeedle(ctx, head.cx + wobbleX, head.cy, bob, w)
      }

      // Snip flash: a quick bright scissors-glint at cycle start of dissolve.
      if (phase === "dissolve") {
        const d = (t - holdEnd) / TUNING.dissolveSeconds
        if (d < 0.18) {
          const flash = (1 - d / 0.18) * 0.4 * layerAlpha
          ctx.fillStyle = `rgba(255,255,255,${flash})`
          ctx.beginPath()
          ctx.arc(geo.box.x + geo.box.w, geo.box.y, 8, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    },
    [sheenDirFor]
  )

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const cycle =
      TUNING.stitchSeconds +
      TUNING.holdSeconds +
      TUNING.dissolveSeconds +
      TUNING.gapSeconds

    const tick = (now: number) => {
      const { w, h } = sizeRef.current
      if (!pausedRef.current && w > 0 && h > 0) {
        let dt = now - lastRef.current
        if (dt > 60) dt = 60 // clamp: backgrounded tab can't teleport state
        if (dt < 0) dt = 0
        tRef.current = (tRef.current + dt / 1000) % cycle
        renderFrame(tRef.current)
      }
      lastRef.current = now
      rafRef.current = requestAnimationFrame(tick)
    }
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [renderFrame])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dims = resize()
    if (!dims) return

    // Paint background immediately so the panel is never blank before the image
    // resolves / loop starts.
    const ctx0 = canvas.getContext("2d")
    if (ctx0) {
      drawFabric(ctx0, dims.w, dims.h, {
        cx: dims.w / 2,
        cy: dims.h / 2,
        r: Math.min(dims.w, dims.h) * 0.46,
      })
    }

    let reducedMotion = false
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      reducedMotion = false
    }

    // ── Load the logo, then build geometry inside onload (never sample before
    //    the image is ready). Same-origin → getImageData is not tainted.
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      readyRef.current = true
      rebuildGeometry()
      // Repaint a representative frame now that stitches exist (covers reduced
      // motion + the pre-loop window).
      if (reducedMotion || pausedRef.current) {
        // Finished, mid-hold frame: fully stitched with a fixed specular rake.
        renderFrame(TUNING.stitchSeconds + TUNING.holdSeconds * 0.45)
      } else {
        renderFrame(tRef.current)
      }
    }
    img.onerror = () => {
      readyRef.current = false // stay on the fabric-only background gracefully
    }
    img.src = LOGO_SRC

    // ── Pointer: track logical mouse pos on the WRAP; subtle until first move.
    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if ((reducedMotion || pausedRef.current) && readyRef.current) {
        renderFrame(TUNING.stitchSeconds + TUNING.holdSeconds * 0.45)
      }
    }
    const onLeave = () => {
      mouseRef.current = null
    }
    wrap.addEventListener("pointermove", onMove, { passive: true })
    wrap.addEventListener("pointerleave", onLeave, { passive: true })

    // ── Debounced resize: re-size + rebuild geometry to the new dimensions.
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const d = resize()
        if (!d) return
        rebuildGeometry()
        const c = canvasRef.current?.getContext("2d")
        if (c && (reducedMotion || pausedRef.current)) {
          renderFrame(TUNING.stitchSeconds + TUNING.holdSeconds * 0.45)
        }
      }, 180)
    }
    window.addEventListener("resize", onResize, { passive: true })

    if (reducedMotion) {
      // Static finished frame only — no rAF loop. (If the image is still loading,
      // img.onload above will paint the finished frame when ready.)
      return () => {
        window.removeEventListener("resize", onResize)
        wrap.removeEventListener("pointermove", onMove)
        wrap.removeEventListener("pointerleave", onLeave)
        if (resizeTimer) clearTimeout(resizeTimer)
        img.onload = null
        img.onerror = null
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        pausedRef.current = !entry.isIntersecting
      },
      { threshold: 0 }
    )
    observer.observe(canvas)

    // Defer the rAF loop to idle so the stitch churn doesn't fight first paint.
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
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerleave", onLeave)
      if (resizeTimer) clearTimeout(resizeTimer)
      img.onload = null
      img.onerror = null
      if (idleHandle !== null) {
        const cancelRic = (window as unknown as { cancelIdleCallback?: (h: number) => void })
          .cancelIdleCallback
        if (typeof cancelRic === "function") cancelRic(idleHandle)
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }
  }, [resize, rebuildGeometry, renderFrame, runLoop])

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
        background: FABRIC_BASE,
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, display: "block" }} />
      {/* Vignette: corner darkening to frame the hoop + add depth. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(8,8,18,0.55) 100%)",
        }}
      />
      {/* Caption chip — names the decoration technique so the sandbox pages are
          distinguishable at a glance. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          pointerEvents: "none",
          padding: "5px 12px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "rgba(231,247,245,0.92)",
          background: "rgba(61,207,194,0.14)",
          border: "1px solid rgba(61,207,194,0.4)",
          backdropFilter: "blur(2px)",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        Machine embroidery
      </div>
    </div>
  )
}
