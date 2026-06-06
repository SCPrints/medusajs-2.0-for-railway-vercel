"use client"

import React, { useCallback, useEffect, useRef } from "react"

/**
 * PrintFormationHero — "Ink to Garment", a DTF / heat-transfer print forming on
 * a blank tee, rendered in a single Canvas 2D layer.
 *
 * THE STORY (one ~10.5s loop, driven by a 5-phase state machine):
 *   SCATTER  (1.6s) — thousands of loose "ink" dots drift around the chest
 *                     print area, each already assigned to a target pixel of the
 *                     real SC PRINTS wordmark but currently flung out to a random
 *                     scatter position.
 *   CONVERGE (2.1s) — every dot springs toward its target with a per-dot stagger,
 *                     so the wordmark assembles organically. Leading "wet" dots
 *                     glow slightly and carry a faint magenta sheen.
 *   PRESS    (1.4s) — a heat-press bar sweeps left→right across the print area.
 *                     BEHIND the sweep the loose dots "set": the actual logo
 *                     image is drawn clipped to a left→right progress mask so the
 *                     art snaps crisp. A white flash + rising steam wisps sell the
 *                     heat. Dots ahead of the bar stay loose; dots behind vanish
 *                     into the solid print.
 *   HOLD     (2.6s) — the finished printed tee sits, with a slow specular glint
 *                     travelling across the print + a gentle fabric "breathe".
 *   RELEASE  (1.6s) — the solid print dissolves back into dots that scatter
 *                     outward, then the loop returns to SCATTER.
 *
 * The tee is drawn procedurally (body, sleeves, collar, hem) over a soft light
 * studio gradient, with a low-amplitude fabric-noise texture + a soft drop
 * shadow so it reads as a real garment. We use a WHITE/pale tee on a light-grey
 * studio bg and the BLACK logo asset for clean contrast.
 *
 * INTERACTIVITY: during SCATTER / CONVERGE the pointer repels nearby ink dots
 * (a hand brushing wet ink) and they spring back; during HOLD the cursor leaves
 * a faint warm glow on the print. Default is "no pointer" until the first move.
 *
 * Accessibility / perf (mirrors digital-rain-hero):
 *   - DPR capped at 2; all drawing in logical px.
 *   - dt clamped to [0, 60]ms so a backgrounded tab can't teleport state.
 *   - prefers-reduced-motion → paint ONE static finished-tee frame, no rAF loop.
 *   - One static frame painted on mount before the loop starts.
 *   - IntersectionObserver pauses the loop when offscreen.
 *   - rAF loop deferred to idle (requestIdleCallback w/ setTimeout fallback).
 *   - Debounced resize rebuilds size-dependent geometry + re-samples the logo.
 *   - The logo is never sampled before it loads (readyRef guard); sampling +
 *     particle targets are (re)built inside img.onload and on resize.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────
const TUNING = {
  // Particle target count band. sampleStep is auto-tuned at sample time so the
  // realised count lands in this range; hard cap enforced regardless.
  targetMin: 2500,
  targetMax: 4000,
  hardCap: 4500,
  // Print area width as a fraction of the tee body width.
  printAreaFrac: 0.46,
  // Phase durations (ms).
  scatterMs: 1600,
  convergeMs: 2100,
  pressMs: 1400,
  holdMs: 2600,
  releaseMs: 1600,
  // Pointer repel radius + strength (logical px / accel).
  repelRadius: 70,
  repelForce: 2600,
  // Spring constants for converge (toward target) / release (toward scatter).
  springK: 150,
  damping: 12,
} as const

type Phase = "SCATTER" | "CONVERGE" | "PRESS" | "HOLD" | "RELEASE"
const PHASE_MS: Record<Phase, number> = {
  SCATTER: TUNING.scatterMs,
  CONVERGE: TUNING.convergeMs,
  PRESS: TUNING.pressMs,
  HOLD: TUNING.holdMs,
  RELEASE: TUNING.releaseMs,
}
const NEXT_PHASE: Record<Phase, Phase> = {
  SCATTER: "CONVERGE",
  CONVERGE: "PRESS",
  PRESS: "HOLD",
  HOLD: "RELEASE",
  RELEASE: "SCATTER",
}

// Brand tokens.
const INK = "#15151c" // near-black ink
const SHEEN = "#ff2e63" // brand-secondary, wet-ink sheen
const TEAL = "#3dcfc2" // brand-accent (caption tint, glints)

// Studio background gradient (light) — bottom stop ~ the section bg for blend.
const BG_GRADIENT =
  "linear-gradient(180deg, #f4f5f7 0%, #eceef2 46%, #e7e9ee 78%, #dee1e8 100%)"

// ─── Math helpers ───────────────────────────────────────────────────────────
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// ─── Geometry: tee + print area ───────────────────────────────────────────────
interface PrintArea {
  x: number // top-left
  y: number
  w: number
  h: number
}
interface Geometry {
  cx: number // tee centre x
  cy: number // tee centre y
  size: number // tee scale unit
  print: PrintArea // chest print rect
}

function computeGeometry(w: number, h: number): Geometry {
  // Tee occupies most of the panel height; size unit scales with the smaller
  // dimension so it stays proportional across aspect ratios.
  const size = Math.min(h * 0.86, w * 0.62)
  const cx = w / 2
  const cy = h / 2 + size * 0.02
  // Print area: centred on chest, ~46% of body width, slightly taller-than-wide.
  const bodyW = size * 0.96 // full body width (2 * 0.48)
  const pw = bodyW * TUNING.printAreaFrac
  const ph = pw * 0.62
  const px = cx - pw / 2
  const py = cy - size * 0.18 - ph / 2 // sit on the upper chest
  return { cx, cy, size, print: { x: px, y: py, w: pw, h: ph } }
}

// Builds the t-shirt outline path (no fill). Caller styles + fills/strokes.
function tshirtPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
): void {
  const bw = size * 0.48 // body half-width
  const ht = size * 0.58 // half-height
  const sw = size * 0.3 // sleeve horizontal extension each side
  const sd = size * 0.3 // sleeve vertical drop
  const nw = size * 0.16 // half-neck width
  const nd = size * 0.13 // neck curve depth
  const top = cy - ht
  const bot = cy + ht
  ctx.beginPath()
  ctx.moveTo(cx - bw - sw, top + size * 0.02)
  ctx.lineTo(cx - bw, top)
  ctx.lineTo(cx - nw, top)
  ctx.quadraticCurveTo(cx, top + nd, cx + nw, top)
  ctx.lineTo(cx + bw, top)
  ctx.lineTo(cx + bw + sw, top + size * 0.02)
  ctx.lineTo(cx + bw + sw, top + sd)
  ctx.quadraticCurveTo(cx + bw + sw * 0.5, top + sd * 1.04, cx + bw, top + sd)
  ctx.lineTo(cx + bw, bot - size * 0.02)
  ctx.quadraticCurveTo(cx, bot + size * 0.02, cx - bw, bot - size * 0.02)
  ctx.lineTo(cx - bw, top + sd)
  ctx.quadraticCurveTo(cx - bw - sw * 0.5, top + sd * 1.04, cx - bw - sw, top + sd)
  ctx.closePath()
}

// ─── Fabric texture (built once per size, cached as a pattern source) ─────────
function buildFabricTexture(): HTMLCanvasElement {
  const tex = document.createElement("canvas")
  // Tile-sized noise; pattern repeats so we keep it tiny + cheap.
  const tw = 96
  const th = 96
  tex.width = tw
  tex.height = th
  const tctx = tex.getContext("2d")
  if (!tctx) return tex
  const img = tctx.createImageData(tw, th)
  for (let i = 0; i < img.data.length; i += 4) {
    // Low-amplitude grey noise around mid-light to read as a soft heather.
    const n = 235 + (Math.random() * 22 - 11)
    img.data[i] = n
    img.data[i + 1] = n
    img.data[i + 2] = n + 2
    img.data[i + 3] = 26 // very light — multiply over the white body
  }
  tctx.putImageData(img, 0, 0)
  return tex
}

// ─── Ink particle ─────────────────────────────────────────────────────────────
interface Ink {
  // target pixel on the logo (logical px)
  tx: number
  ty: number
  // scatter "home" position (logical px) — where it drifts during SCATTER and
  // where it flies back out during RELEASE.
  sx: number
  sy: number
  // current position + velocity (for pointer repel spring)
  x: number
  y: number
  vx: number
  vy: number
  r: number // dot radius
  stagger: number // 0..1 per-dot converge delay
  wet: number // 0..1 — leading/wet weighting (brighter + sheen)
  drift: number // phase for the ambient scatter drift
}

// Sample the loaded logo image into target points inside the print area.
function buildInk(
  img: HTMLImageElement,
  geo: Geometry,
  w: number,
  h: number
): Ink[] {
  const { print } = geo
  // Draw the logo "contain"-fit into the print area on an offscreen canvas.
  const off = document.createElement("canvas")
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return []
  const fit = Math.min(print.w / iw, print.h / ih)
  const bw = Math.max(1, Math.round(iw * fit))
  const bh = Math.max(1, Math.round(ih * fit))
  off.width = bw
  off.height = bh
  const octx = off.getContext("2d")
  if (!octx) return []
  octx.clearRect(0, 0, bw, bh)
  octx.drawImage(img, 0, 0, bw, bh)
  let data: Uint8ClampedArray
  try {
    data = octx.getImageData(0, 0, bw, bh).data
  } catch {
    return [] // tainted (shouldn't happen — same-origin) — fail safe
  }

  // Where the logo box lands inside the print area (centre it).
  const ox = print.x + (print.w - bw) / 2
  const oy = print.y + (print.h - bh) / 2

  // Auto-tune sampleStep so the realised inked-cell count lands in band.
  let step = 3
  const countAt = (s: number) => {
    let c = 0
    for (let py = 0; py < bh; py += s) {
      for (let px = 0; px < bw; px += s) {
        if (data[(py * bw + px) * 4 + 3] > 40) c++
      }
    }
    return c
  }
  // Grow the step until we're at/under targetMax; shrink toward targetMin.
  let guard = 0
  while (countAt(step) > TUNING.targetMax && guard++ < 12) step += 1
  while (step > 2 && countAt(step - 1) <= TUNING.targetMax && guard++ < 24) step -= 1
  if (countAt(step) < TUNING.targetMin && step > 2) step -= 1

  const inks: Ink[] = []
  for (let py = 0; py < bh; py += step) {
    for (let px = 0; px < bw; px += step) {
      const a = data[(py * bw + px) * 4 + 3]
      if (a <= 40) continue
      const tx = ox + px + rand(-0.4, 0.4)
      const ty = oy + py + rand(-0.4, 0.4)
      // Scatter home: a ring of positions around the tee, biased to the print
      // area's vertical band so the swarm reads as "ink hovering over the chest".
      // Clamped to the panel so dots never drift fully off-canvas.
      const ang = Math.random() * Math.PI * 2
      const rad = rand(geo.size * 0.18, geo.size * 0.62)
      const sx = Math.max(8, Math.min(w - 8, geo.cx + Math.cos(ang) * rad))
      const sy = Math.max(
        8,
        Math.min(h - 8, geo.print.y + geo.print.h / 2 + Math.sin(ang) * rad * 0.7)
      )
      inks.push({
        tx,
        ty,
        sx,
        sy,
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        r: rand(0.9, 1.9),
        stagger: Math.random(),
        wet: clamp01((a / 255) * rand(0.4, 1)),
        drift: Math.random() * Math.PI * 2,
      })
      if (inks.length >= TUNING.hardCap) return inks
    }
  }
  // Light shuffle so converge stagger isn't a tidy raster sweep.
  for (let i = inks.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    const t = inks[i]
    inks[i] = inks[j]
    inks[j] = t
  }
  return inks
}

// ─── Draw: the studio + tee (shared across all phases) ────────────────────────
function drawTee(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  fabric: CanvasPattern | null,
  breathe: number
): void {
  const { cx, cy, size } = geo

  // Soft drop shadow on the floor beneath the tee.
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = "#1a1a2e"
  ctx.beginPath()
  ctx.ellipse(cx, cy + size * 0.62, size * 0.42, size * 0.07, 0, 0, Math.PI * 2)
  ctx.filter = "blur(6px)"
  ctx.fill()
  ctx.restore()

  // Tee body — gentle "breathe" scale.
  const s = size * (1 + breathe * 0.006)
  ctx.save()
  tshirtPath(ctx, cx, cy, s)
  // Base white-ish body with a top-down sheen so it isn't a flat fill.
  const grad = ctx.createLinearGradient(0, cy - s * 0.6, 0, cy + s * 0.6)
  grad.addColorStop(0, "#ffffff")
  grad.addColorStop(0.5, "#f3f4f7")
  grad.addColorStop(1, "#e6e8ee")
  ctx.fillStyle = grad
  ctx.fill()

  // Fabric heather texture, clipped to the body.
  if (fabric) {
    ctx.clip()
    ctx.globalCompositeOperation = "multiply"
    ctx.fillStyle = fabric
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2)
    ctx.globalCompositeOperation = "source-over"
  }
  ctx.restore()

  // Collar rib + subtle seam shading for garment realism.
  ctx.save()
  tshirtPath(ctx, cx, cy, s)
  ctx.clip()
  // Left-side soft shading.
  const sh = ctx.createLinearGradient(cx - s * 0.5, 0, cx + s * 0.5, 0)
  sh.addColorStop(0, "rgba(26,26,46,0.06)")
  sh.addColorStop(0.5, "rgba(26,26,46,0)")
  sh.addColorStop(1, "rgba(26,26,46,0.05)")
  ctx.fillStyle = sh
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2)
  ctx.restore()

  // Collar ribbing arc.
  const nw = s * 0.16
  const nd = s * 0.13
  const top = cy - s * 0.58
  ctx.save()
  ctx.strokeStyle = "rgba(26,26,46,0.18)"
  ctx.lineWidth = Math.max(2, s * 0.012)
  ctx.beginPath()
  ctx.moveTo(cx - nw, top)
  ctx.quadraticCurveTo(cx, top + nd, cx + nw, top)
  ctx.stroke()
  // Second, lighter rib line below.
  ctx.strokeStyle = "rgba(26,26,46,0.09)"
  ctx.beginPath()
  ctx.moveTo(cx - nw * 0.9, top + s * 0.018)
  ctx.quadraticCurveTo(cx, top + nd + s * 0.02, cx + nw * 0.9, top + s * 0.018)
  ctx.stroke()
  ctx.restore()
}

// Faint print-area registration frame (only visible pre-print, fades as it fills)
function drawPrintFrame(
  ctx: CanvasRenderingContext2D,
  print: PrintArea,
  alpha: number
): void {
  if (alpha <= 0.01) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = TEAL
  ctx.lineWidth = 1.25
  ctx.setLineDash([6, 6])
  ctx.strokeRect(
    Math.round(print.x) - 6,
    Math.round(print.y) - 6,
    Math.round(print.w) + 12,
    Math.round(print.h) + 12
  )
  ctx.restore()
}

// ─── Draw: ink swarm ──────────────────────────────────────────────────────────
// pos(): for each ink, where it is THIS frame given the phase + progress.
function drawInk(
  ctx: CanvasRenderingContext2D,
  inks: Ink[],
  phase: Phase,
  _p: number, // phase progress 0..1 (reserved; currently phase-only)
  pressX: number, // press bar x (PRESS phase) — dots behind it are hidden
  swarmAlpha: number
): void {
  if (swarmAlpha <= 0.01) return
  ctx.save()
  // Two-pass: soft wet-ink bloom (lighter) then crisp dots.
  // Pass 1 — bloom for the wettest leading dots.
  ctx.globalCompositeOperation = "source-over"
  for (let i = 0; i < inks.length; i++) {
    const ink = inks[i]
    // In PRESS, dots whose target is left of the bar are "set" → skip (the
    // solid image covers them). Dots ahead stay loose.
    if (phase === "PRESS" && ink.tx <= pressX) continue
    const wet = ink.wet
    const baseA = swarmAlpha * lerp(0.5, 1, wet)
    // Wet sheen halo.
    if (wet > 0.55) {
      ctx.globalAlpha = baseA * 0.5 * (wet - 0.55) * 2
      ctx.fillStyle = SHEEN
      ctx.beginPath()
      ctx.arc(ink.x, ink.y, ink.r * 2.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Pass 2 — crisp ink dots.
  for (let i = 0; i < inks.length; i++) {
    const ink = inks[i]
    if (phase === "PRESS" && ink.tx <= pressX) continue
    const wet = ink.wet
    ctx.globalAlpha = swarmAlpha * lerp(0.55, 1, wet)
    ctx.fillStyle = wet > 0.7 ? "#23232e" : INK
    ctx.beginPath()
    ctx.arc(ink.x, ink.y, ink.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// ─── Draw: the solid printed logo, clipped to a left→right progress mask ───────
function drawSolidPrint(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  geo: Geometry,
  maskFrac: number, // 0..1 — how far the set-edge has swept across
  alpha: number
): { logoX: number; logoY: number; logoW: number; logoH: number } | null {
  const { print } = geo
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return null
  const fit = Math.min(print.w / iw, print.h / ih)
  const lw = Math.round(iw * fit)
  const lh = Math.round(ih * fit)
  const lx = print.x + (print.w - lw) / 2
  const ly = print.y + (print.h - lh) / 2
  if (maskFrac > 0.001 && alpha > 0.01) {
    ctx.save()
    ctx.globalAlpha = alpha
    // Clip to the swept region [lx, lx + lw * maskFrac].
    ctx.beginPath()
    ctx.rect(lx, ly - 4, lw * clamp01(maskFrac), lh + 8)
    ctx.clip()
    ctx.drawImage(img, lx, ly, lw, lh)
    ctx.restore()
  }
  return { logoX: lx, logoY: ly, logoW: lw, logoH: lh }
}

// ─── Draw: heat-press bar + flash + steam ─────────────────────────────────────
function drawPress(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  pressX: number,
  _p: number,
  steam: { x: number; y: number; life: number; r: number }[]
): void {
  const { print } = geo
  const top = print.y - 14
  const bot = print.y + print.h + 14

  // Steam/heat wisps rising just behind the bar.
  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  for (const w of steam) {
    const a = clamp01(w.life) * 0.18
    if (a <= 0.01) continue
    ctx.globalAlpha = a
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // The set-edge white flash line.
  ctx.save()
  const flashGrad = ctx.createLinearGradient(pressX - 26, 0, pressX + 8, 0)
  flashGrad.addColorStop(0, "rgba(255,255,255,0)")
  flashGrad.addColorStop(0.75, "rgba(255,255,255,0.55)")
  flashGrad.addColorStop(1, "rgba(255,255,255,0.9)")
  ctx.fillStyle = flashGrad
  ctx.fillRect(pressX - 26, top, 34, bot - top)
  ctx.restore()

  // The press bar itself — a metallic vertical bar with a teal heat glow edge.
  ctx.save()
  const barW = 12
  const barGrad = ctx.createLinearGradient(pressX - barW, 0, pressX + barW, 0)
  barGrad.addColorStop(0, "#3a3a52")
  barGrad.addColorStop(0.5, "#6b6b86")
  barGrad.addColorStop(1, "#2a2a3e")
  ctx.fillStyle = barGrad
  ctx.fillRect(pressX - barW / 2, top - 6, barW, bot - top + 12)
  // Hot leading edge.
  ctx.fillStyle = "rgba(61,207,194,0.85)"
  ctx.fillRect(pressX + barW / 2 - 1, top - 6, 2.5, bot - top + 12)
  ctx.shadowColor = TEAL
  ctx.shadowBlur = 14
  ctx.fillRect(pressX + barW / 2 - 1, top - 6, 2.5, bot - top + 12)
  ctx.restore()
}

// ─── Component ─────────────────────────────────────────────────────────────────
type Props = { className?: string; style?: React.CSSProperties }

export default function PrintFormationHero({ className, style }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 })

  // Logo + readiness.
  const imgRef = useRef<HTMLImageElement | null>(null)
  const readyRef = useRef(false)
  const fabricTexRef = useRef<HTMLCanvasElement | null>(null)
  const fabricPatRef = useRef<CanvasPattern | null>(null)

  // Sim state.
  const geoRef = useRef<Geometry | null>(null)
  const inksRef = useRef<Ink[]>([])
  const phaseRef = useRef<Phase>("SCATTER")
  const phaseTRef = useRef<number>(0) // ms elapsed in current phase
  const lastRef = useRef<number>(0)
  const steamRef = useRef<{ x: number; y: number; life: number; r: number }[]>([])
  const glintRef = useRef<number>(0) // HOLD-phase specular sweep position

  // Pointer (logical px); active=false until first move.
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  })

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
    return { w, h, ctx }
  }, [])

  // Rebuild all size-dependent geometry + re-sample the logo into ink targets.
  const rebuild = useCallback((w: number, h: number) => {
    const geo = computeGeometry(w, h)
    geoRef.current = geo
    // Fabric pattern (built off a tiny noise tile).
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    fabricTexRef.current = buildFabricTexture()
    fabricPatRef.current =
      ctx && fabricTexRef.current ? ctx.createPattern(fabricTexRef.current, "repeat") : null
    // Ink targets (only if the logo is loaded).
    if (readyRef.current && imgRef.current) {
      inksRef.current = buildInk(imgRef.current, geo, w, h)
    }
  }, [])

  // Snap every ink to its scatter home (used when (re)entering SCATTER).
  const resetToScatter = useCallback(() => {
    for (const ink of inksRef.current) {
      ink.x = ink.sx
      ink.y = ink.sy
      ink.vx = 0
      ink.vy = 0
    }
  }, [])

  // Paint a single composited frame for the given phase + progress. Reused by
  // the loop AND the static / reduced-motion frame (with phase HOLD, p=1).
  const paintFrame = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, phase: Phase, p: number) => {
      const geo = geoRef.current
      if (!geo) return
      ctx.clearRect(0, 0, w, h)

      // Gentle fabric breathe in HOLD; flat otherwise.
      const breathe =
        phase === "HOLD" ? Math.sin(p * Math.PI * 2) * 0.5 + 0.5 : 0
      drawTee(ctx, geo, fabricPatRef.current, breathe)

      // Print-frame guide: bright while empty, fades as the print forms.
      const frameAlpha =
        phase === "SCATTER"
          ? 0.35 * (1 - p * 0.3)
          : phase === "CONVERGE"
          ? 0.22 * (1 - p)
          : 0
      drawPrintFrame(ctx, geo.print, frameAlpha)

      const img = imgRef.current
      const inks = inksRef.current

      if (phase === "PRESS") {
        // Press bar sweeps left→right across the print area.
        const sweep = easeInOutCubic(p)
        const pressX = geo.print.x + geo.print.w * sweep
        // Solid print revealed behind the bar.
        if (img) drawSolidPrint(ctx, img, geo, sweep, 1)
        // Loose dots ahead of the bar still visible.
        drawInk(ctx, inks, "PRESS", p, pressX, 1)
        drawPress(ctx, geo, pressX, p, steamRef.current)
      } else if (phase === "HOLD") {
        // Solid print, fully set.
        if (img) {
          const box = drawSolidPrint(ctx, img, geo, 1, 1)
          // Specular glint sweeping across + optional cursor warm glow.
          if (box) {
            const gx = box.logoX + box.logoW * (glintRef.current % 1)
            ctx.save()
            ctx.beginPath()
            ctx.rect(box.logoX, box.logoY, box.logoW, box.logoH)
            ctx.clip()
            const g = ctx.createLinearGradient(gx - 30, 0, gx + 30, 0)
            g.addColorStop(0, "rgba(255,255,255,0)")
            g.addColorStop(0.5, "rgba(255,255,255,0.4)")
            g.addColorStop(1, "rgba(255,255,255,0)")
            ctx.fillStyle = g
            ctx.globalCompositeOperation = "soft-light"
            ctx.fillRect(box.logoX, box.logoY, box.logoW, box.logoH)
            ctx.restore()
            const m = mouseRef.current
            if (m.active) {
              ctx.save()
              const warm = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 60)
              warm.addColorStop(0, "rgba(255,46,99,0.10)")
              warm.addColorStop(1, "rgba(255,46,99,0)")
              ctx.fillStyle = warm
              ctx.beginPath()
              ctx.arc(m.x, m.y, 60, 0, Math.PI * 2)
              ctx.fill()
              ctx.restore()
            }
          }
        }
      } else if (phase === "RELEASE") {
        // Solid fades out as dots scatter back out.
        const fade = 1 - easeOutCubic(p)
        if (img) drawSolidPrint(ctx, img, geo, 1, fade)
        drawInk(ctx, inks, "RELEASE", p, 0, easeOutCubic(p))
      } else {
        // SCATTER / CONVERGE → just the loose dots.
        const a = phase === "SCATTER" ? 1 : 1
        drawInk(ctx, inks, phase, p, 0, a)
      }
    },
    []
  )

  // Per-frame physics for the ink swarm.
  const stepInk = useCallback(
    (dt: number, phase: Phase, p: number) => {
      const inks = inksRef.current
      const geo = geoRef.current
      if (!geo) return
      const m = mouseRef.current
      const dtS = dt / 1000
      const repelR2 = TUNING.repelRadius * TUNING.repelRadius

      for (const ink of inks) {
        // Target this frame depends on phase.
        let goalX = ink.sx
        let goalY = ink.sy
        let stiffness: number = TUNING.springK
        if (phase === "SCATTER") {
          // Ambient drift around the scatter home.
          ink.drift += dtS * 1.4
          goalX = ink.sx + Math.cos(ink.drift) * geo.size * 0.012
          goalY = ink.sy + Math.sin(ink.drift * 0.8) * geo.size * 0.012
          stiffness = 40
        } else if (phase === "CONVERGE") {
          // Staggered ease toward target — early dots lead, late dots follow.
          const local = clamp01((p - ink.stagger * 0.45) / 0.55)
          const e = easeOutCubic(local)
          goalX = lerp(ink.sx, ink.tx, e)
          goalY = lerp(ink.sy, ink.ty, e)
          stiffness = lerp(60, 220, e)
        } else if (phase === "PRESS") {
          goalX = ink.tx
          goalY = ink.ty
          stiffness = 240
        } else if (phase === "RELEASE") {
          // Fly back out to scatter home with a slight overshoot.
          const e = easeInOutCubic(p)
          goalX = lerp(ink.tx, ink.sx, e)
          goalY = lerp(ink.ty, ink.sy, e)
          stiffness = lerp(120, 50, e)
        }

        // Spring toward goal (semi-implicit) with damping.
        const ax = (goalX - ink.x) * stiffness
        const ay = (goalY - ink.y) * stiffness
        ink.vx += ax * dtS
        ink.vy += ay * dtS

        // Pointer repel — only meaningful in SCATTER / CONVERGE (wet ink).
        if (m.active && (phase === "SCATTER" || phase === "CONVERGE")) {
          const dx = ink.x - m.x
          const dy = ink.y - m.y
          const d2 = dx * dx + dy * dy
          if (d2 < repelR2 && d2 > 0.5) {
            const d = Math.sqrt(d2)
            const f = (1 - d / TUNING.repelRadius) * TUNING.repelForce
            ink.vx += (dx / d) * f * dtS
            ink.vy += (dy / d) * f * dtS
          }
        }

        // Damping.
        const damp = Math.exp(-TUNING.damping * dtS)
        ink.vx *= damp
        ink.vy *= damp
        ink.x += ink.vx * dtS
        ink.y += ink.vy * dtS
      }
    },
    []
  )

  const runLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const tick = (now: number) => {
      const { w, h } = sizeRef.current
      if (!pausedRef.current && w > 0 && h > 0 && readyRef.current) {
        let dt = now - lastRef.current
        if (dt > 60) dt = 60
        if (dt < 0) dt = 0

        // Advance the phase clock.
        phaseTRef.current += dt
        let phase = phaseRef.current
        if (phaseTRef.current >= PHASE_MS[phase]) {
          phaseTRef.current -= PHASE_MS[phase]
          const next = NEXT_PHASE[phase]
          phaseRef.current = next
          phase = next
          if (phase === "SCATTER") resetToScatter()
          if (phase === "PRESS") {
            steamRef.current = []
            glintRef.current = 0
          }
        }
        const p = clamp01(phaseTRef.current / PHASE_MS[phase])

        // Phase-specific bookkeeping.
        if (phase === "PRESS") {
          // Spawn steam wisps just behind the moving bar.
          const geo = geoRef.current
          if (geo) {
            const sweep = easeInOutCubic(p)
            const pressX = geo.print.x + geo.print.w * sweep
            if (Math.random() < 0.5) {
              steamRef.current.push({
                x: pressX - rand(2, 16),
                y: rand(geo.print.y, geo.print.y + geo.print.h),
                life: 1,
                r: rand(2, 5),
              })
            }
          }
          // Age steam.
          for (const s of steamRef.current) {
            s.life -= dt / 700
            s.y -= (dt / 1000) * 28
            s.r += (dt / 1000) * 10
          }
          steamRef.current = steamRef.current.filter((s) => s.life > 0)
        }
        if (phase === "HOLD") {
          glintRef.current += dt / PHASE_MS.HOLD // one sweep across the hold
        }

        stepInk(dt, phase, p)
        paintFrame(ctx, w, h, phase, p)
      }
      lastRef.current = now
      rafRef.current = requestAnimationFrame(tick)
    }
    lastRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }, [paintFrame, stepInk, resetToScatter])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const dims = resize()
    if (!dims) return
    rebuild(dims.w, dims.h)

    const ctx = canvas.getContext("2d")

    let reducedMotion = false
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    } catch {
      reducedMotion = false
    }

    // Paint the tee immediately (logo not yet loaded → tee + frame only) so the
    // panel is never blank before the image resolves.
    if (ctx) paintFrame(ctx, dims.w, dims.h, "SCATTER", 0)

    // ── Load the logo, then build ink targets + paint a representative frame ──
    const img = new Image()
    img.decoding = "async"
    img.onload = () => {
      imgRef.current = img
      readyRef.current = true
      const { w, h } = sizeRef.current
      // (Re)sample inks now that we have the image.
      const geo = geoRef.current ?? computeGeometry(w, h)
      geoRef.current = geo
      inksRef.current = buildInk(img, geo, w, h)
      resetToScatter()
      const c = canvasRef.current?.getContext("2d")
      if (c) {
        // Reduced-motion / pre-loop static frame = the FINISHED printed tee.
        paintFrame(c, w, h, reducedMotion || pausedRef.current ? "HOLD" : "SCATTER", reducedMotion ? 0 : 0)
      }
    }
    img.onerror = () => {
      // Leave readyRef false — the loop no-ops; the tee + frame still render.
      readyRef.current = false
    }
    // Same-origin asset (in /public) → getImageData stays untainted.
    img.src = "/branding/sc-prints-logo-transparent.png"

    // ── Pointer handlers on the WRAP (subtle, logical px) ──
    const toLocal = (clientX: number, clientY: number) => {
      const r = wrap.getBoundingClientRect()
      mouseRef.current.x = clientX - r.left
      mouseRef.current.y = clientY - r.top
      mouseRef.current.active = true
    }
    const onMove = (e: PointerEvent) => toLocal(e.clientX, e.clientY)
    const onLeave = () => {
      mouseRef.current.active = false
    }
    wrap.addEventListener("pointermove", onMove, { passive: true })
    wrap.addEventListener("pointerleave", onLeave, { passive: true })

    // ── Debounced resize: rebuild geometry + re-sample, repaint if idle ──
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const d = resize()
        if (!d) return
        rebuild(d.w, d.h)
        resetToScatter()
        const c = canvasRef.current?.getContext("2d")
        if (c && (reducedMotion || pausedRef.current)) {
          paintFrame(c, d.w, d.h, "HOLD", 0)
        }
      }, 180)
    }
    window.addEventListener("resize", onResize, { passive: true })

    if (reducedMotion) {
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

    // Defer the rAF loop to idle so it doesn't fight first paint / hydration.
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
  }, [resize, rebuild, runLoop, paintFrame, resetToScatter])

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

      {/* Subtle studio vignette to frame the tee centre-stage. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 50% 46%, transparent 52%, rgba(120,126,140,0.22) 100%)",
        }}
      />

      {/* Technique caption chip — bottom-left, brand-tinted, non-interactive. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          pointerEvents: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px",
          borderRadius: 9999,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "#1a1a2e",
          background: "rgba(61,207,194,0.16)",
          border: "1px solid rgba(61,207,194,0.45)",
          backdropFilter: "blur(2px)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 9999,
            background: SHEEN,
            display: "inline-block",
          }}
        />
        DTF heat-transfer
      </div>
    </div>
  )
}
