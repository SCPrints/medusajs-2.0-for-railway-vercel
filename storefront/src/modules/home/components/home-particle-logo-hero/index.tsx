"use client"

import NextImage from "next/image"
import { useReducedMotion } from "framer-motion"
import { createPortal } from "react-dom"
import type { CSSProperties } from "react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import {
  ANIMATED_PARTICLE_CAP,
  DRAG_RADIUS,
  FRICTION,
  FULL_HERO_HOME_FRACTION,
  FULLSCREEN_LOGO_NUDGE_Y_CSS,
  FULLSCREEN_LOGO_PAD,
  FULLSCREEN_PARTICLE_DRAW_SIZE_BMP,
  MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED,
  ANIMATED_PARTICLE_ALPHA_MULT,
  PARTICLE_ALPHA_CAP,
  PARTICLE_BASE_ALPHA,
  PARTICLE_DRAW_SIZE_BMP,
  PARTICLE_ENTRANCE_DURATION_MS,
  PARTICLE_ENTRANCE_SPAWN_SPREAD_FRAC,
  PARTICLE_ENTRANCE_STAGGER_FRAC,
  PARTICLE_RADIUS_MIN_CSS,
  PHYSICS_DIST_EPSILON,
  PUSH_FORCE,
  PUSH_REPULSE_FALLOFF_POWER,
  SPRING_STIFFNESS,
  SWIRL_FORCE,
  PARALLAX_EASE,
  PARALLAX_MOUSE_SENSITIVITY,
  PARALLAX_MULT_C,
  SHOW_MOUSE_CURSOR_DEBUG_MARKER,
  LOGO_TILT_MAX_DEG,
  LOGO_TILT_PERSPECTIVE_PX,
  LOGO_TILT_SMOOTHING,
  WAKE_TRAIL_MAX_POINTS,
  WAKE_TRAIL_SAMPLE_DIST_BMP,
  WAKE_TRAIL_AGE_DECAY,
  WAKE_TRAIL_RADIUS_FRAC,
  WAKE_TRAIL_FORCE_FRAC,
  WAKE_SPRING_STIFFNESS,
  WAKE_FRICTION,
  WAKE_TRAIL_SWIRL_FRAC,
  BLACK_HOLE_RADIUS_MULT,
  BLACK_HOLE_PULL_FORCE,
  BLACK_HOLE_SWIRL_MULT,
  BLACK_HOLE_RING_HOLD_DIST_BMP,
  BLACK_HOLE_RING_PUSH,
  BLACK_HOLE_HOME_SPRING_SUPPRESS,
  BLACK_HOLE_SPRING_STIFFNESS_MULT,
  BLACK_HOLE_FRICTION,
  BLACK_HOLE_TRAIL_FOLLOW_MS,
  BLACK_HOLE_TRAIL_FOLLOW_ACCEL,
  VISCOUS_COFFEE_TRAIL_MAX_POINTS,
  VISCOUS_COFFEE_SAMPLE_DIST_BMP,
  VISCOUS_COFFEE_PATH_DECAY,
  VISCOUS_COFFEE_LINE_RADIUS_BMP,
  VISCOUS_COFFEE_ALONG_STRENGTH,
  VISCOUS_COFFEE_SHEAR_STRENGTH,
  VISCOUS_COFFEE_LIVE_PUSH_FRAC,
  VISCOUS_COFFEE_LIVE_SWIRL_FRAC,
  VISCOUS_COFFEE_SPRING_STIFFNESS,
  VISCOUS_COFFEE_FRICTION,
  VISCOUS_COFFEE_ERODE_EVERY_FRAMES,
  VISCOUS_COFFEE_WAKE_PARTICLE_COUNT,
  VISCOUS_COFFEE_WAKE_ARC_HEAD_KEEP,
  VISCOUS_COFFEE_WAKE_SPREAD_BMP,
  VISCOUS_COFFEE_WAKE_SPRING_STIFFNESS,
  VISCOUS_COFFEE_WAKE_FRICTION,
  VISCOUS_COFFEE_WAKE_ALPHA_MULT,
} from "./constants"

const DEFAULT_LOGO_SRC = "/branding/sc-prints-logo-transparent.png"
const FALLBACK_SRC = "/branding/sc-prints-logo-white.png"

const MIX_REVEAL_MS = 1350
const MIX_REVEAL_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

/** If logo renders with no usable alpha (some SVG/CORS cases), sample bright ink on black. */
const FALLBACK_BRIGHT_SUM = 280

/**
 * Rasterize the logo on a transparent offscreen canvas and collect bitmap pixels
 * where alpha exceeds mid threshold (solid logo ink on transparent PNG/SVG).
 */
function gatherAlphaCandidates(
  W: number,
  H: number,
  dpr: number,
  img: CanvasImageSource,
  wCss: number,
  hCss: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): Array<{ x: number; y: number }> {
  const off = document.createElement("canvas")
  off.width = W
  off.height = H
  const octx = off.getContext("2d", { alpha: true })
  if (!octx) {
    return []
  }
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.scale(dpr, dpr)
  octx.clearRect(0, 0, wCss, hCss)
  octx.drawImage(img, dx, dy, dw, dh)

  let imageData: ImageData
  try {
    imageData = octx.getImageData(0, 0, W, H)
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[HomeParticleLogoHero] getImageData (alpha pass) failed:", e)
    }
    return []
  }

  const out: Array<{ x: number; y: number }> = []
  const data = imageData.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const a = data[i + 3]
      if (a > 128) {
        out.push({ x, y })
      }
    }
  }
  return out
}

/**
 * Second pass: black background + draw image; keep bright pixels (white logo on black).
 */
function gatherBrightInkCandidates(
  W: number,
  H: number,
  dpr: number,
  img: CanvasImageSource,
  wCss: number,
  hCss: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): Array<{ x: number; y: number }> {
  const off = document.createElement("canvas")
  off.width = W
  off.height = H
  const octx = off.getContext("2d", { alpha: true })
  if (!octx) {
    return []
  }
  octx.setTransform(1, 0, 0, 1, 0, 0)
  octx.scale(dpr, dpr)
  octx.fillStyle = "#000"
  octx.fillRect(0, 0, wCss, hCss)
  octx.drawImage(img, dx, dy, dw, dh)

  let imageData: ImageData
  try {
    imageData = octx.getImageData(0, 0, W, H)
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[HomeParticleLogoHero] getImageData (bright pass) failed:", e)
    }
    return []
  }

  const out: Array<{ x: number; y: number }> = []
  const data = imageData.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r + g + b >= FALLBACK_BRIGHT_SUM) {
        out.push({ x, y })
      }
    }
  }
  return out
}

/**
 * Bitmap-space particles; position integrated in the RAF loop (or kinematic entrance).
 */
type ParallaxParticle = {
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  radiusCss: number
  baseAlpha: number
  fromLogoMask: boolean
  /** Top-left spawn for entrance lerp. */
  spawnX: number
  spawnY: number
  /**
   * 0 = screen bottom-right priority (starts moving first); 1 = top-left (starts last).
   */
  entranceStagger: number
  /** Multiplies drawn opacity during entrance (0…1). */
  entranceOpacity: number
  /** Black hole: was inside capture disk (geom) last frame — exit edge starts trail. */
  bhPrevInRadius: boolean
  /** Black hole: `performance.now()` deadline for escort-toward-cursor; null if inactive. */
  bhTrailUntilMs: number | null
}

type LogoInteractBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function logoHomeBounds(particles: ParallaxParticle[]): LogoInteractBounds | null {
  if (particles.length === 0) {
    return null
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of particles) {
    const hx = Number.isFinite(p.hx) ? p.hx : 0
    const hy = Number.isFinite(p.hy) ? p.hy : 0
    minX = Math.min(minX, hx)
    minY = Math.min(minY, hy)
    maxX = Math.max(maxX, hx)
    maxY = Math.max(maxY, hy)
  }
  return { minX, minY, maxX, maxY }
}

function pointerInLogoBoundsPad(
  mx: number,
  my: number,
  b: LogoInteractBounds | null,
  pad: number
): boolean {
  if (b == null || !Number.isFinite(mx) || !Number.isFinite(my)) {
    return false
  }
  return (
    mx >= b.minX - pad &&
    mx <= b.maxX + pad &&
    my >= b.minY - pad &&
    my <= b.maxY + pad
  )
}

function pointerNearStippleHome(
  mx: number,
  my: number,
  particles: ParallaxParticle[] | null,
  radius: number
): boolean {
  if (
    particles == null ||
    particles.length === 0 ||
    !Number.isFinite(mx) ||
    !Number.isFinite(my)
  ) {
    return false
  }
  const r2 = radius * radius
  for (const p of particles) {
    const hx = Number.isFinite(p.hx) ? p.hx : 0
    const hy = Number.isFinite(p.hy) ? p.hy : 0
    const dx = mx - hx
    const dy = my - hy
    if (dx * dx + dy * dy <= r2) {
      return true
    }
  }
  return false
}

function pointerInStippleInteractionRange(
  mx: number,
  my: number,
  bounds: LogoInteractBounds | null,
  particles: ParallaxParticle[] | null,
  proximityRadius: number
): boolean {
  if (!pointerInLogoBoundsPad(mx, my, bounds, proximityRadius)) {
    return false
  }
  return pointerNearStippleHome(mx, my, particles, proximityRadius)
}

function canvasScale(canvas: HTMLCanvasElement) {
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  const sx = canvas.width / Math.max(1, cw)
  const sy = canvas.height / Math.max(1, ch)
  return { sx, sy }
}

/** Same `dpr` and `w × h` box as `build()` so pointer maps to particle bitmap pixels. */
function backingDpr() {
  return Math.min(window.devicePixelRatio ?? 1, 2)
}

function viewportBox() {
  const wBox = Math.max(120, Math.floor(window.innerWidth))
  const hBox = Math.max(120, Math.floor(window.innerHeight))
  return { wBox, hBox }
}

/**
 * Client px → canvas backing-store px. Uses `getBoundingClientRect()` when the canvas exists.
 * Parallax is applied in physics (`mouseX`/`mouseY`) and in `drawLayer` via `ctx.translate`, not via CSS.
 */
function clientToBitmapViewport(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement | null
): { x: number; y: number } {
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    const rect = canvas.getBoundingClientRect()
    const rw = Math.max(1, rect.width)
    const rh = Math.max(1, rect.height)
    return {
      x: ((clientX - rect.left) / rw) * canvas.width,
      y: ((clientY - rect.top) / rh) * canvas.height,
    }
  }
  const iw = Math.max(1, window.innerWidth)
  const ih = Math.max(1, window.innerHeight)
  const dpr = backingDpr()
  const W = Math.max(1, Math.round(iw * dpr))
  const H = Math.max(1, Math.round(ih * dpr))
  return {
    x: (clientX / iw) * W,
    y: (clientY / ih) * H,
  }
}

function easeOutCubic(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return 1 - Math.pow(1 - u, 3)
}

/** Radial push + tangential swirl toward `PUSH_FORCE` / `SWIRL_FORCE` (scaled). */
function applyRadialSwirlImpulse(
  p: ParallaxParticle,
  cx: number,
  cy: number,
  radius: number,
  impulseMul: number,
  swirlScale = 1
): void {
  if (cx <= -9000 || impulseMul <= 0 || radius <= 0) {
    return
  }
  const dx = p.x - cx
  const dy = p.y - cy
  const dist = Math.hypot(dx, dy)
  if (dist >= radius || dist < PHYSICS_DIST_EPSILON) {
    return
  }
  const t = (radius - dist) / radius
  const falloff = Math.pow(
    Math.max(0, Math.min(1, t)),
    PUSH_REPULSE_FALLOFF_POWER
  )
  const f = falloff * impulseMul
  const inv = 1 / dist
  const ux = dx * inv
  const uy = dy * inv
  const sF = SWIRL_FORCE * swirlScale
  p.vx += (ux * PUSH_FORCE + uy * sF) * f
  p.vy += (uy * PUSH_FORCE - ux * sF) * f
}

/** Inward pull + accretion swirl + inner ring so particles orbit the cursor instead of collapsing. */
function applyBlackHoleImpulse(
  p: ParallaxParticle,
  cx: number,
  cy: number,
  radius: number
): void {
  if (cx <= -9000 || radius <= 0) {
    return
  }
  const dx = p.x - cx
  const dy = p.y - cy
  const dist = Math.hypot(dx, dy)
  if (dist >= radius) {
    return
  }
  if (dist < PHYSICS_DIST_EPSILON) {
    return
  }
  const inv = 1 / dist
  const ux = dx * inv
  const uy = dy * inv
  const edge = (radius - dist) / radius
  const falloff = Math.pow(
    Math.max(0, Math.min(1, edge)),
    PUSH_REPULSE_FALLOFF_POWER
  )
  const pull = BLACK_HOLE_PULL_FORCE * falloff
  p.vx -= ux * pull
  p.vy -= uy * pull
  const sw = SWIRL_FORCE * BLACK_HOLE_SWIRL_MULT * falloff
  p.vx += uy * sw
  p.vy -= ux * sw
  if (dist < BLACK_HOLE_RING_HOLD_DIST_BMP) {
    const ringU =
      1 -
      dist /
        Math.max(PHYSICS_DIST_EPSILON * 10, BLACK_HOLE_RING_HOLD_DIST_BMP)
    const ring = BLACK_HOLE_RING_PUSH * ringU * ringU
    p.vx += ux * ring
    p.vy += uy * ring
  }
}

/** Weak steering for particles outside the capture disk during trail-follow window. */
function applyBlackHoleTrailFollow(
  p: ParallaxParticle,
  cx: number,
  cy: number
): void {
  if (cx <= -9000) {
    return
  }
  const dx = cx - p.x
  const dy = cy - p.y
  const dist = Math.hypot(dx, dy)
  if (dist < PHYSICS_DIST_EPSILON) {
    return
  }
  const inv = 1 / dist
  const a = BLACK_HOLE_TRAIL_FOLLOW_ACCEL
  p.vx += dx * inv * a
  p.vy += dy * inv * a
}

function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): { cx: number; cy: number; t: number; dist: number } {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby
  let t =
    ab2 > 1e-10 ? (apx * abx + apy * aby) / ab2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return { cx, cy, t, dist: Math.hypot(dx, dy) }
}

/** Viscous stroke: drag along path tangent + normal shear from each segment (coffee remembers spoon). */
function applyViscousCoffeeAlongPath(
  p: ParallaxParticle,
  trail: Array<{ x: number; y: number }>
): void {
  if (trail.length < 2) {
    return
  }
  const n = trail.length
  const R = VISCOUS_COFFEE_LINE_RADIUS_BMP
  for (let i = 0; i < n - 1; i++) {
    const a = trail[i]!
    const b = trail[i + 1]!
    const minX = Math.min(a.x, b.x) - R
    const maxX = Math.max(a.x, b.x) + R
    const minY = Math.min(a.y, b.y) - R
    const maxY = Math.max(a.y, b.y) + R
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
      continue
    }
    const { cx, cy, dist } = closestPointOnSegment(
      p.x,
      p.y,
      a.x,
      a.y,
      b.x,
      b.y
    )
    if (dist > R) {
      continue
    }
    const bx = b.x - a.x
    const by = b.y - a.y
    const segLen = Math.hypot(bx, by)
    if (segLen < 1e-5) {
      continue
    }
    const tx = bx / segLen
    const ty = by / segLen
    const nx = -ty
    const ny = tx
    const ageW = Math.pow(VISCOUS_COFFEE_PATH_DECAY, n - 2 - i)
    const edgeW = 1 - dist / R
    const w = ageW * edgeW * edgeW
    p.vx += tx * VISCOUS_COFFEE_ALONG_STRENGTH * w
    p.vy += ty * VISCOUS_COFFEE_ALONG_STRENGTH * w
    const side = (p.x - cx) * nx + (p.y - cy) * ny
    const sgn = side >= 0 ? 1 : -1
    p.vx += nx * VISCOUS_COFFEE_SHEAR_STRENGTH * w * sgn
    p.vy += ny * VISCOUS_COFFEE_SHEAR_STRENGTH * w * sgn
  }
}

function polylineTotalLength(
  trail: Array<{ x: number; y: number }>
): number {
  if (trail.length < 2) {
    return 0
  }
  let L = 0
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i]!
    const b = trail[i + 1]!
    L += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return L
}

/** Point `distAlong` from trail start, unit tangent at that point (for lateral spread). */
function pointOnPolylineAtDistance(
  trail: Array<{ x: number; y: number }>,
  distAlong: number
): { x: number; y: number; tx: number; ty: number } {
  if (trail.length === 0) {
    return { x: 0, y: 0, tx: 1, ty: 0 }
  }
  if (trail.length === 1) {
    const p = trail[0]!
    return { x: p.x, y: p.y, tx: 1, ty: 0 }
  }
  let remaining = Math.max(0, distAlong)
  for (let i = 0; i < trail.length - 1; i++) {
    const a = trail[i]!
    const b = trail[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segLen = Math.hypot(dx, dy)
    if (segLen < 1e-6) {
      continue
    }
    if (remaining <= segLen) {
      const t = remaining / segLen
      const tx = dx / segLen
      const ty = dy / segLen
      return {
        x: a.x + t * dx,
        y: a.y + t * dy,
        tx,
        ty,
      }
    }
    remaining -= segLen
  }
  const a = trail[trail.length - 2]!
  const b = trail[trail.length - 1]!
  const dx = b.x - a.x
  const dy = b.y - a.y
  const segLen = Math.hypot(dx, dy)
  const tx = segLen > 1e-6 ? dx / segLen : 1
  const ty = segLen > 1e-6 ? dy / segLen : 0
  return { x: b.x, y: b.y, tx, ty }
}

function createCoffeeWakeParticlePool(
  W: number,
  H: number,
  count: number
): ParallaxParticle[] {
  const cx = Math.max(0, Math.floor(W / 2))
  const cy = Math.max(0, Math.floor(H / 2))
  const out: ParallaxParticle[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      hx: cx,
      hy: cy,
      x: cx,
      y: cy,
      radiusCss: PARTICLE_RADIUS_MIN_CSS,
      baseAlpha: 0,
      vx: 0,
      vy: 0,
      fromLogoMask: false,
      spawnX: cx,
      spawnY: cy,
      entranceStagger: 0,
      entranceOpacity: 1,
      bhPrevInRadius: false,
      bhTrailUntilMs: null,
    })
  }
  return out
}

/** Move wake targets along the stroke; fade in as the path gains length. */
function assignCoffeeWakeTargets(
  wake: ParallaxParticle[],
  trail: Array<{ x: number; y: number }>
): void {
  const nW = wake.length
  if (nW === 0) {
    return
  }
  const totalLen = polylineTotalLength(trail)
  if (trail.length < 2 || totalLen < 2) {
    for (const p of wake) {
      p.baseAlpha = 0
    }
    return
  }
  const maxDist = totalLen * VISCOUS_COFFEE_WAKE_ARC_HEAD_KEEP
  const fadeLen = Math.min(1, totalLen / 28)
  const fadePts = Math.min(1, (trail.length - 1) / 2.5)
  const alphaBase =
    PARTICLE_BASE_ALPHA *
    VISCOUS_COFFEE_WAKE_ALPHA_MULT *
    fadeLen *
    fadePts

  const denom = Math.max(1, nW - 1)
  for (let i = 0; i < nW; i++) {
    const p = wake[i]!
    const u = i / denom
    const d = u * maxDist
    const { x, y, tx, ty } = pointOnPolylineAtDistance(trail, d)
    const nx = -ty
    const ny = tx
    const rng = ((i * 2654435761) >>> 0) / 4294967296
    const spread = (rng - 0.5) * 2 * VISCOUS_COFFEE_WAKE_SPREAD_BMP
    p.hx = x + nx * spread
    p.hy = y + ny * spread
    p.baseAlpha = alphaBase
  }
}

function integrateCoffeeWakeParticles(wake: ParallaxParticle[]): void {
  const sk = VISCOUS_COFFEE_WAKE_SPRING_STIFFNESS
  const fk = VISCOUS_COFFEE_WAKE_FRICTION
  for (const p of wake) {
    if ((p.baseAlpha ?? 0) <= 1e-6) {
      p.vx = 0
      p.vy = 0
      continue
    }
    p.vx += (p.hx - p.x) * sk
    p.vy += (p.hy - p.y) * sk
    p.vx *= fk
    p.vy *= fk
    p.x += p.vx
    p.y += p.vy
  }
}

/** `h` degrees [0,360); `s`,`l` in [0,1]. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hd = ((h % 360) + 360) % 360
  const hn = hd / 360
  if (s <= 0) {
    const x = Math.round(l * 255)
    return { r: x, g: x, b: x }
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let u = t
    if (u < 0) u += 1
    if (u > 1) u -= 1
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hue2rgb(p, q, hn + 1 / 3)
  const g = hue2rgb(p, q, hn)
  const b = hue2rgb(p, q, hn - 1 / 3)
  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255))),
    g: Math.round(Math.max(0, Math.min(255, g * 255))),
    b: Math.round(Math.max(0, Math.min(255, b * 255))),
  }
}

/** Screen-space diagonal rainbow from particle home; keeps hue stable while dots move. */
function rainbowRgbForHome(
  hx: number,
  hy: number,
  cw: number,
  ch: number
): { r: number; g: number; b: number } {
  const w = Math.max(1, cw - 1)
  const h = Math.max(1, ch - 1)
  const u = Math.max(0, Math.min(1, hx / w))
  const v = Math.max(0, Math.min(1, hy / h))
  const hue = 360 * (0.62 * u + 0.38 * v)
  return hslToRgb(hue, 0.9, 0.52)
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  particles: ParallaxParticle[],
  sx: number,
  sy: number,
  mouseRef: { current: { x: number; y: number } },
  /** Multiply debug dot radius (use backing-store DPR). */
  debugDotDpr: number,
  /** Parallax offset in “CSS px” space: `T.x * PARALLAX_MULT_C` / `T.y * PARALLAX_MULT_C`. */
  parallaxX: number,
  parallaxY: number,
  /** When false, skip `translate` (reduced motion). */
  applyCanvasParallax: boolean,
  drawSizeBmp = PARTICLE_DRAW_SIZE_BMP,
  /** e.g. viscous-coffee stroke followers (drawn on top of logo stipple). */
  extraParticles?: ParallaxParticle[] | null
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.save()
  if (applyCanvasParallax) {
    ctx.translate(parallaxX * sx, parallaxY * sy)
  }
  const d = drawSizeBmp
  const bitmapW = canvas.width
  const bitmapH = canvas.height
  const drawOne = (p: ParallaxParticle) => {
    const ba = Number.isFinite(p.baseAlpha) ? p.baseAlpha : PARTICLE_BASE_ALPHA
    const op = Number.isFinite(p.entranceOpacity) ? p.entranceOpacity : 1
    const alpha = Math.min(
      PARTICLE_ALPHA_CAP,
      Math.max(0, ba * ANIMATED_PARTICLE_ALPHA_MULT * op)
    )
    const hx = Number.isFinite(p.hx) ? p.hx : 0
    const hy = Number.isFinite(p.hy) ? p.hy : 0
    const { r: pr, g: pg, b: pb } = rainbowRgbForHome(hx, hy, bitmapW, bitmapH)
    ctx.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`
    const px = Number.isFinite(p.x) ? p.x : hx
    const py = Number.isFinite(p.y) ? p.y : hy
    let xBmp = px
    let yBmp = py
    if (!Number.isFinite(xBmp)) {
      xBmp = px
    }
    if (!Number.isFinite(yBmp)) {
      yBmp = py
    }
    ctx.fillRect(xBmp, yBmp, d, d)
  }
  for (const p of particles) {
    drawOne(p)
  }
  if (extraParticles != null && extraParticles.length > 0) {
    for (const p of extraParticles) {
      drawOne(p)
    }
  }

  const m = mouseRef.current
  if (
    SHOW_MOUSE_CURSOR_DEBUG_MARKER &&
    Number.isFinite(m.x) &&
    Number.isFinite(m.y) &&
    m.x > -9000
  ) {
    const r = 20 * debugDotDpr
    ctx.fillStyle = "#ff00ff"
    ctx.beginPath()
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

type Props = {
  logoSrc?: string
  /**
   * `embedded` — portal inside the parent hero (home).
   * `fullscreen` — fixed 100vw×100vh layer on `document.body` + mix reveal + viewport physics tuning.
   */
  presentation?: "embedded" | "fullscreen"
  /**
   * Stipple count (logo mask + hero grid per `FULL_HERO_HOME_FRACTION`). Defaults to `ANIMATED_PARTICLE_CAP`.
   */
  animatedParticleCap?: number
  /**
   * `"fluidWake"` — radial wake disks. `"blackHole"` — capture disk + trail follow.
   * `"viscousCoffee"` — polyline path memory (tangent + shear), viscous slow fill-in.
   */
  interactionMode?: "default" | "fluidWake" | "blackHole" | "viscousCoffee"
  /** Overrides default `aria-label` on the outer `<section>` (embedded). */
  sectionAriaLabel?: string
}

export default function HomeParticleLogoHero({
  logoSrc = DEFAULT_LOGO_SRC,
  presentation = "embedded",
  animatedParticleCap = ANIMATED_PARTICLE_CAP,
  interactionMode = "default",
  sectionAriaLabel,
}: Props) {
  const presentationRef = useRef(presentation)
  presentationRef.current = presentation
  const interactionModeRef = useRef(interactionMode)
  interactionModeRef.current = interactionMode
  const wakeTrailRef = useRef<Array<{ x: number; y: number }>>([])
  const viscousCoffeeTrailRef = useRef<Array<{ x: number; y: number }>>([])
  const viscousCoffeeErodeAccRef = useRef(0)
  const viscousCoffeeWakeParticlesRef = useRef<ParallaxParticle[] | null>(
    null
  )

  /** Always-on interaction; never set to false. */
  const reducedMotion = useReducedMotion()
  /** Layer parallax respects OS reduced-motion. */
  const reduceParallax = reducedMotion === true

  /** Axis-aligned logo home bounds in bitmap px (for fast hit reject). */
  const logoInteractBoundsRef = useRef<LogoInteractBounds | null>(null)
  /** Wall-clock start of entrance lerp (−1 = disabled / reduced motion). */
  const particleEntranceStartMsRef = useRef(-1)
  const particleDrawSizeBmpRef = useRef(PARTICLE_DRAW_SIZE_BMP)

  const reduceParallaxRef = useRef(reduceParallax)
  reduceParallaxRef.current = reduceParallax

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const canvasORef = useRef<HTMLCanvasElement>(null)
  const canvasARef = useRef<HTMLCanvasElement>(null)
  const canvasCRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<ParallaxParticle[] | null>(null)
  const rafRef = useRef<number | null>(null)
  /** Restarts the simulation loop if it was idle (e.g. after tab sleep). */
  const rafResumeRef = useRef<() => void>(() => {})
  /** Stable 2D context for canvasC; reset in build after backing store is sized. */
  const canvasCCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const buildRef = useRef<() => void>(() => {})
  /** Throttle `build()` calls kicked from RAF when fixing null-particle races. */
  const rafBuildKickAtRef = useRef(0)
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null)
  /** Raw pointer in bitmap px from `clientToBitmapViewport`; tick subtracts parallax for physics. */
  const mouseRawBmpRef = useRef<{ x: number; y: number } | null>(null)
  /** Bitmap-space cursor; `active` stays true (no click/drag gates). */
  const mouseRef = useRef({
    active: true,
    x: -9999,
    y: -9999,
    deltaX: 0,
    deltaY: 0,
  })
  const parallaxLRef = useRef({ x: 0, y: 0 })
  const parallaxTRef = useRef({ x: 0, y: 0 })
  const logoTiltTargetRef = useRef({ rx: 0, ry: 0 })
  const logoTiltCurrentRef = useRef({ rx: 0, ry: 0 })
  const logoTiltLayerRef = useRef<HTMLDivElement | null>(null)
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  /** Hide static fallback `<img>` once canvases have sampled the logo and spawned particles. */
  const [logoRasterReady, setLogoRasterReady] = useState(false)
  /** Client-only; portal mounts canvases inside the hero (black panel). */
  const [portalReady, setPortalReady] = useState(false)
  const [particleLayerHostReady, setParticleLayerHostReady] = useState(false)
  /** Fullscreen mode does not use `wrapRef` as the portal host. */
  const [fullscreenHostReady, setFullscreenHostReady] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)
  const logoImgRef = useRef<HTMLImageElement | null>(null)
  logoImgRef.current = logoImg

  const layerReady =
    presentation === "fullscreen" ? fullscreenHostReady : particleLayerHostReady

  const mixRevealActive = presentation === "fullscreen" && !reduceParallax

  useLayoutEffect(() => {
    if (presentation === "fullscreen") {
      setFullscreenHostReady(true)
    } else {
      setFullscreenHostReady(false)
    }
  }, [presentation])

  useEffect(() => {
    if (presentation !== "fullscreen") {
      setIsRevealed(true)
      return
    }
    if (reduceParallax) {
      setIsRevealed(true)
      return
    }
    setIsRevealed(false)
    const timer = setTimeout(() => setIsRevealed(true), 200)
    return () => clearTimeout(timer)
  }, [presentation, reduceParallax])

  useLayoutEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    setLogoRasterReady(false)
    setLoadFailed(false)
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    img.onload = () => {
      void img
        .decode()
        .catch(() => {
          /* decode optional; onload already fired */
        })
        .finally(() => {
          requestAnimationFrame(() => setLogoImg(img))
        })
    }
    img.onerror = () => setLoadFailed(true)
    img.src = logoSrc
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [logoSrc])

  const build = useCallback(() => {
    const c0 = canvasORef.current
    const c1 = canvasARef.current
    const c2 = canvasCRef.current
    const img = logoImg
    if (!c0 || !c1 || !c2 || !img || !img.naturalWidth) {
      return
    }

    const dpr = backingDpr()
    const iw = Math.max(1, window.innerWidth)
    const ih = Math.max(1, window.innerHeight)

    for (const c of [c0, c1, c2]) {
      c.style.width = "100%"
      c.style.height = "100%"
    }
    const useViewportBitmap = presentationRef.current === "fullscreen"
    const br = c0.getBoundingClientRect()
    const cw = useViewportBitmap
      ? Math.max(1, Math.round(iw))
      : Math.max(1, Math.round(br.width || c0.clientWidth || iw))
    const ch = useViewportBitmap
      ? Math.max(1, Math.round(ih))
      : Math.max(1, Math.round(br.height || c0.clientHeight || ih))
    const W = Math.round(cw * dpr)
    const H = Math.round(ch * dpr)

    for (const c of [c0, c1, c2]) {
      c.width = W
      c.height = H
    }

    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const isFsBuild = presentationRef.current === "fullscreen"
    const pad = isFsBuild ? FULLSCREEN_LOGO_PAD : 0.985
    const logoScale = Math.min((W * pad) / nw, (H * pad) / nh)
    const dw = nw * logoScale
    const dh = nh * logoScale
    /** Physics mask centered in bitmap W×H (`W`/`H` ≡ viewport × dpr). */
    const dx = (W - nw * logoScale) / 2
    let dy = (H - nh * logoScale) / 2
    if (isFsBuild) {
      dy += Math.round(FULLSCREEN_LOGO_NUDGE_Y_CSS * dpr)
    }

    const wCss = W / dpr
    const hCss = H / dpr
    const dxCss = dx / dpr
    const dyCss = dy / dpr
    const dwCss = dw / dpr
    const dhCss = dh / dpr

    let candidates: Array<{ x: number; y: number }>
    try {
      candidates = gatherAlphaCandidates(W, H, dpr, img, wCss, hCss, dxCss, dyCss, dwCss, dhCss)
      if (candidates.length === 0) {
        candidates = gatherBrightInkCandidates(W, H, dpr, img, wCss, hCss, dxCss, dyCss, dwCss, dhCss)
      }
    } catch {
      setLoadFailed(true)
      return
    }

    if (process.env.NODE_ENV === "development") {
      if (candidates.length === 0) {
        console.warn(
          "[HomeParticleLogoHero] No mask pixels — check asset and CORS; tried alpha + bright-ink fallback."
        )
      }
    }

    const nLogo = candidates.length
    const cap = Math.max(1, Math.floor(animatedParticleCap))
    const heroHomeCount =
      nLogo > 0
        ? Math.min(cap, Math.round(cap * FULL_HERO_HOME_FRACTION))
        : cap
    const logoHomeCount = cap - heroHomeCount
    const particles: ParallaxParticle[] = []

    const gridCols = Math.max(1, Math.ceil(Math.sqrt(heroHomeCount)))
    const gridRows = Math.max(1, Math.ceil(heroHomeCount / gridCols))
    for (let k = 0; k < heroHomeCount; k++) {
      const col = k % gridCols
      const row = Math.floor(k / gridCols)
      const hx = Math.min(
        W - 1,
        Math.round(((col + 0.5) / Math.max(1, gridCols)) * (W - 1))
      )
      const hy = Math.min(
        H - 1,
        Math.round(((row + 0.5) / Math.max(1, gridRows)) * (H - 1))
      )
      particles.push({
        hx,
        hy,
        x: hx,
        y: hy,
        radiusCss: PARTICLE_RADIUS_MIN_CSS,
        baseAlpha: PARTICLE_BASE_ALPHA,
        vx: 0,
        vy: 0,
        fromLogoMask: false,
        spawnX: hx,
        spawnY: hy,
        entranceStagger: 0,
        entranceOpacity: 1,
        bhPrevInRadius: false,
        bhTrailUntilMs: null,
      })
    }

    for (let k = 0; k < logoHomeCount; k++) {
      let idx: number
      if (nLogo >= logoHomeCount) {
        idx =
          logoHomeCount <= 1
            ? 0
            : Math.min(
                nLogo - 1,
                Math.floor((k * (nLogo - 1)) / (logoHomeCount - 1))
              )
      } else {
        idx = k % nLogo
      }
      const c = candidates[idx]!
      const hx = Number(c.x) || 0
      const hy = Number(c.y) || 0
      particles.push({
        hx,
        hy,
        x: hx,
        y: hy,
        radiusCss: PARTICLE_RADIUS_MIN_CSS,
        baseAlpha: PARTICLE_BASE_ALPHA,
        vx: 0,
        vy: 0,
        fromLogoMask: true,
        spawnX: hx,
        spawnY: hy,
        entranceStagger: 0,
        entranceOpacity: 1,
        bhPrevInRadius: false,
        bhTrailUntilMs: null,
      })
    }

    particleDrawSizeBmpRef.current = isFsBuild
      ? FULLSCREEN_PARTICLE_DRAW_SIZE_BMP
      : PARTICLE_DRAW_SIZE_BMP

    if (reduceParallaxRef.current) {
      for (const p of particles) {
        p.spawnX = p.hx
        p.spawnY = p.hy
        p.x = p.hx
        p.y = p.hy
        p.vx = 0
        p.vy = 0
        p.entranceStagger = 0
        p.entranceOpacity = 1
      }
      particleEntranceStartMsRef.current = -1
    } else {
      const spread = Math.min(W, H) * PARTICLE_ENTRANCE_SPAWN_SPREAD_FRAC
      const tlx = W * 0.02 - spread * 0.38
      const tly = H * 0.0225
      const invW = W > 1 ? 1 / (W - 1) : 0
      const invH = H > 1 ? 1 / (H - 1) : 0
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!
        const nx = Math.max(0, Math.min(1, p.hx * invW))
        const ny = Math.max(0, Math.min(1, p.hy * invH))
        const u = (nx + ny) * 0.5
        p.entranceStagger = 1 - u
        const rngU = ((i * 2654435761) >>> 0) / 4294967296
        const rngV = ((i * 2246822519) >>> 0) / 4294967296
        p.spawnX = tlx + rngU * spread
        p.spawnY = tly + rngV * spread
        p.x = p.spawnX
        p.y = p.spawnY
        p.vx = 0
        p.vy = 0
        p.entranceOpacity = 0
      }
      particleEntranceStartMsRef.current = performance.now()
    }

    parallaxTRef.current = { x: 0, y: 0 }
    parallaxLRef.current = { x: 0, y: 0 }

    const ctx0 = c0.getContext("2d", { alpha: true })
    const ctx1 = c1.getContext("2d", { alpha: true })
    const ctx2 = c2.getContext("2d", { alpha: true })
    if (!ctx0 || !ctx1 || !ctx2) {
      canvasCCtxRef.current = null
      setLogoRasterReady(false)
      return
    }
    canvasCCtxRef.current = ctx2
    particlesRef.current = particles
    logoInteractBoundsRef.current = logoHomeBounds(particles)
    if (interactionModeRef.current === "viscousCoffee") {
      viscousCoffeeWakeParticlesRef.current = createCoffeeWakeParticlePool(
        W,
        H,
        VISCOUS_COFFEE_WAKE_PARTICLE_COUNT
      )
    } else {
      viscousCoffeeWakeParticlesRef.current = null
    }
    const { sx, sy } = canvasScale(c0)

    ctx0.clearRect(0, 0, c0.width, c0.height)
    ctx1.clearRect(0, 0, c1.width, c1.height)

    const dotDpr = c2.width / Math.max(1, c2.clientWidth)
    const fs = presentationRef.current === "fullscreen"
    drawLayer(
      ctx2,
      c2,
      particles,
      sx,
      sy,
      mouseRef,
      dotDpr,
      0,
      0,
      !reduceParallax && !fs,
      particleDrawSizeBmpRef.current,
      viscousCoffeeWakeParticlesRef.current
    )

    setLogoRasterReady(particles.length > 0)

    if (lastPointerClientRef.current == null) {
      const rSeed = c0.getBoundingClientRect()
      const scx = Math.floor(rSeed.left + rSeed.width / 2)
      const scy = Math.floor(rSeed.top + rSeed.height / 2)
      lastPointerClientRef.current = { x: scx, y: scy }
      const sb = clientToBitmapViewport(scx, scy, c2)
      mouseRawBmpRef.current = {
        x: sb.x,
        y: sb.y,
      }
    }
  }, [logoImg, reduceParallax, animatedParticleCap, interactionMode])

  buildRef.current = build

  useLayoutEffect(() => {
    if (!portalReady || !layerReady) {
      return
    }
    build()
  }, [build, portalReady, layerReady])

  useEffect(() => {
    if (!reduceParallax) {
      return
    }
    parallaxTRef.current = { x: 0, y: 0 }
    parallaxLRef.current = { x: 0, y: 0 }
  }, [reduceParallax])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      if (t != null) {
        clearTimeout(t)
      }
      t = setTimeout(() => {
        t = undefined
        build()
      }, 100)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      if (t != null) {
        clearTimeout(t)
      }
    }
  }, [build])

  useEffect(() => {
    if (!particleLayerHostReady) {
      return
    }
    if (presentationRef.current === "fullscreen") {
      return
    }
    const el = wrapRef.current
    if (!el) {
      return
    }
    const ro = new ResizeObserver(() => {
      buildRef.current()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [particleLayerHostReady, presentation])

  useEffect(() => {
    let frameId: number | null = null
    const tick = () => {
      try {
        const c2 = canvasCRef.current
        const ctx2 = canvasCCtxRef.current
        const particles = particlesRef.current
        const reduceParallaxNow = reduceParallaxRef.current

        if (!c2) {
          return
        }

        if (particles == null) {
          if (logoImgRef.current?.naturalWidth && canvasCRef.current) {
            const t = performance.now()
            if (t - rafBuildKickAtRef.current > 200) {
              rafBuildKickAtRef.current = t
              buildRef.current()
            }
          }
          return
        }

        if (!ctx2) {
          return
        }

        if (particles.length === 0) {
          return
        }

        const { sx, sy } = canvasScale(c2)
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) {
          return
        }
        const isFs = presentationRef.current === "fullscreen"
        const L = parallaxLRef.current
        const T = parallaxTRef.current
        const Tx = Number.isFinite(T.x) ? T.x : 0
        const Ty = Number.isFinite(T.y) ? T.y : 0
        T.x = Tx
        T.y = Ty

        const Lx = Number.isFinite(L.x) ? L.x : 0
        const Ly = Number.isFinite(L.y) ? L.y : 0
        const applyCanvasParallax = !reduceParallaxNow && !isFs
        if (applyCanvasParallax) {
          T.x += (Lx - T.x) * PARALLAX_EASE
          T.y += (Ly - T.y) * PARALLAX_EASE
          if (!Number.isFinite(T.x)) {
            T.x = 0
          }
          if (!Number.isFinite(T.y)) {
            T.y = 0
          }
        } else {
          T.x = 0
          T.y = 0
        }

        mouseRef.current.active = true

        const lpBmp = lastPointerClientRef.current
        if (lpBmp != null && c2.width > 0 && c2.height > 0) {
          const bNow = clientToBitmapViewport(lpBmp.x, lpBmp.y, c2)
          mouseRawBmpRef.current = {
            x: Number.isFinite(bNow.x) ? bNow.x : -9999,
            y: Number.isFinite(bNow.y) ? bNow.y : -9999,
          }
        }

        const raw = mouseRawBmpRef.current

        const hitBx = applyCanvasParallax ? T.x * PARALLAX_MULT_C * sx : 0
        const hitBy = applyCanvasParallax ? T.y * PARALLAX_MULT_C * sy : 0

        let currentMouseX = -9999
        let currentMouseY = -9999
        if (raw != null && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
          currentMouseX = raw.x - hitBx
          currentMouseY = raw.y - hitBy
        }

        mouseRef.current.x = currentMouseX
        mouseRef.current.y = currentMouseY

        const Tdur = PARTICLE_ENTRANCE_DURATION_MS
        const entranceT0 = particleEntranceStartMsRef.current
        let entranceActive =
          entranceT0 >= 0 && !reduceParallaxNow && Tdur > 0

        if (entranceActive) {
          const elapsed = performance.now() - entranceT0
          if (elapsed >= Tdur) {
            for (const p of particles) {
              p.x = p.hx
              p.y = p.hy
              p.vx = 0
              p.vy = 0
              p.entranceOpacity = 1
            }
            particleEntranceStartMsRef.current = -1
            entranceActive = false
          } else {
            const sFrac = PARTICLE_ENTRANCE_STAGGER_FRAC
            for (const p of particles) {
              const tStart = p.entranceStagger * sFrac * Tdur
              const moveDur = Math.max(1e-6, Tdur - tStart)
              if (elapsed <= tStart) {
                p.x = p.spawnX
                p.y = p.spawnY
                p.vx = 0
                p.vy = 0
                p.entranceOpacity = 0
              } else {
                const rawU = (elapsed - tStart) / moveDur
                const pathU = easeOutCubic(rawU)
                p.x = p.spawnX + (p.hx - p.spawnX) * pathU
                p.y = p.spawnY + (p.hy - p.spawnY) * pathU
                p.vx = 0
                p.vy = 0
                p.entranceOpacity = easeOutCubic(rawU)
              }
            }
          }
        }

        const fluidWake = interactionModeRef.current === "fluidWake"
        const blackHole = interactionModeRef.current === "blackHole"
        const viscousCoffee =
          interactionModeRef.current === "viscousCoffee"
        const nowTick = performance.now()
        const bhBounds = logoInteractBoundsRef.current
        const inBlackHoleStipple =
          blackHole &&
          !entranceActive &&
          bhBounds != null &&
          currentMouseX > -9000 &&
          pointerInStippleInteractionRange(
            currentMouseX,
            currentMouseY,
            bhBounds,
            particles,
            DRAG_RADIUS
          )

        const inViscousStipple =
          viscousCoffee &&
          !entranceActive &&
          bhBounds != null &&
          currentMouseX > -9000 &&
          pointerInStippleInteractionRange(
            currentMouseX,
            currentMouseY,
            bhBounds,
            particles,
            DRAG_RADIUS
          )

        if (fluidWake && !entranceActive) {
          const bWake = logoInteractBoundsRef.current
          const nearWake =
            bWake != null &&
            currentMouseX > -9000 &&
            pointerInStippleInteractionRange(
              currentMouseX,
              currentMouseY,
              bWake,
              particles,
              DRAG_RADIUS
            )
          if (nearWake) {
            const trail = wakeTrailRef.current
            const last = trail[trail.length - 1]
            if (
              !last ||
              Math.hypot(currentMouseX - last.x, currentMouseY - last.y) >=
                WAKE_TRAIL_SAMPLE_DIST_BMP
            ) {
              trail.push({ x: currentMouseX, y: currentMouseY })
              while (trail.length > WAKE_TRAIL_MAX_POINTS) {
                trail.shift()
              }
            }
          } else {
            wakeTrailRef.current = []
          }
        }

        if (viscousCoffee && !entranceActive) {
          const bV = logoInteractBoundsRef.current
          const nearV =
            bV != null &&
            currentMouseX > -9000 &&
            pointerInStippleInteractionRange(
              currentMouseX,
              currentMouseY,
              bV,
              particles,
              DRAG_RADIUS
            )
          const trail = viscousCoffeeTrailRef.current
          if (nearV) {
            const last = trail[trail.length - 1]
            if (
              !last ||
              Math.hypot(
                currentMouseX - last.x,
                currentMouseY - last.y
              ) >= VISCOUS_COFFEE_SAMPLE_DIST_BMP
            ) {
              trail.push({
                x: currentMouseX,
                y: currentMouseY,
              })
              while (
                trail.length > VISCOUS_COFFEE_TRAIL_MAX_POINTS
              ) {
                trail.shift()
              }
            }
            viscousCoffeeErodeAccRef.current = 0
          } else {
            viscousCoffeeErodeAccRef.current++
            if (
              viscousCoffeeErodeAccRef.current >=
              VISCOUS_COFFEE_ERODE_EVERY_FRAMES
            ) {
              viscousCoffeeErodeAccRef.current = 0
              if (trail.length > 0) {
                trail.shift()
              }
            }
          }
        }

        const springKBase = fluidWake
          ? WAKE_SPRING_STIFFNESS
          : viscousCoffee
            ? VISCOUS_COFFEE_SPRING_STIFFNESS
            : blackHole
              ? SPRING_STIFFNESS * BLACK_HOLE_SPRING_STIFFNESS_MULT
              : SPRING_STIFFNESS
        const frictionK = fluidWake
          ? WAKE_FRICTION
          : viscousCoffee
            ? VISCOUS_COFFEE_FRICTION
            : blackHole
              ? BLACK_HOLE_FRICTION
              : FRICTION
        const trailSnap = wakeTrailRef.current
        const bhRadius = DRAG_RADIUS * BLACK_HOLE_RADIUS_MULT
        const cursorOk = currentMouseX > -9000

        if (!entranceActive) {
          for (const p of particles) {
            if (blackHole) {
              if (
                p.bhTrailUntilMs != null &&
                nowTick >= p.bhTrailUntilMs
              ) {
                p.bhTrailUntilMs = null
              }

              const distM = cursorOk
                ? Math.hypot(
                    p.x - currentMouseX,
                    p.y - currentMouseY
                  )
                : Infinity
              const inCaptureDiskGeom =
                cursorOk && distM < bhRadius
              const captured =
                inBlackHoleStipple && inCaptureDiskGeom

              if (captured) {
                p.bhTrailUntilMs = null
                applyBlackHoleImpulse(
                  p,
                  currentMouseX,
                  currentMouseY,
                  bhRadius
                )
              } else if (
                p.bhPrevInRadius &&
                !inCaptureDiskGeom
              ) {
                p.bhTrailUntilMs = nowTick + BLACK_HOLE_TRAIL_FOLLOW_MS
              }

              const trailing =
                p.bhTrailUntilMs != null &&
                nowTick < p.bhTrailUntilMs &&
                !inCaptureDiskGeom

              if (trailing && cursorOk) {
                applyBlackHoleTrailFollow(
                  p,
                  currentMouseX,
                  currentMouseY
                )
              }

              let springMul = 1
              if (captured && distM < bhRadius * 1.05) {
                const u = Math.max(0, 1 - distM / (bhRadius * 1.05))
                springMul =
                  1 - BLACK_HOLE_HOME_SPRING_SUPPRESS * u * u
              }

              const homeSpring = trailing ? 0 : 1

              p.vx +=
                (p.hx - p.x) * springKBase * springMul * homeSpring
              p.vy +=
                (p.hy - p.y) * springKBase * springMul * homeSpring
              p.vx *= frictionK
              p.vy *= frictionK
              p.x += p.vx
              p.y += p.vy

              p.bhPrevInRadius = inCaptureDiskGeom
            } else if (viscousCoffee) {
              p.bhPrevInRadius = false
              p.bhTrailUntilMs = null

              applyViscousCoffeeAlongPath(
                p,
                viscousCoffeeTrailRef.current
              )

              if (inViscousStipple) {
                applyRadialSwirlImpulse(
                  p,
                  currentMouseX,
                  currentMouseY,
                  DRAG_RADIUS,
                  VISCOUS_COFFEE_LIVE_PUSH_FRAC,
                  VISCOUS_COFFEE_LIVE_SWIRL_FRAC
                )
              }

              p.vx += (p.hx - p.x) * springKBase
              p.vy += (p.hy - p.y) * springKBase
              p.vx *= frictionK
              p.vy *= frictionK
              p.x += p.vx
              p.y += p.vy
            } else {
              p.bhPrevInRadius = false
              p.bhTrailUntilMs = null

              applyRadialSwirlImpulse(
                p,
                currentMouseX,
                currentMouseY,
                DRAG_RADIUS,
                1,
                1
              )

              if (fluidWake && trailSnap.length > 1) {
                const nTrail = trailSnap.length
                const maxReach =
                  DRAG_RADIUS * (1 + WAKE_TRAIL_RADIUS_FRAC)
                for (let i = 0; i < nTrail - 1; i++) {
                  const pt = trailSnap[i]!
                  if (
                    Math.abs(p.x - pt.x) > maxReach ||
                    Math.abs(p.y - pt.y) > maxReach
                  ) {
                    continue
                  }
                  if (Math.hypot(p.x - pt.x, p.y - pt.y) > maxReach) {
                    continue
                  }
                  const age = nTrail - 1 - i
                  const w =
                    WAKE_TRAIL_FORCE_FRAC *
                    Math.pow(WAKE_TRAIL_AGE_DECAY, age)
                  applyRadialSwirlImpulse(
                    p,
                    pt.x,
                    pt.y,
                    DRAG_RADIUS * WAKE_TRAIL_RADIUS_FRAC,
                    w,
                    WAKE_TRAIL_SWIRL_FRAC
                  )
                }
              }

              let springMul = 1

              p.vx += (p.hx - p.x) * springKBase * springMul
              p.vy += (p.hy - p.y) * springKBase * springMul
              p.vx *= frictionK
              p.vy *= frictionK
              p.x += p.vx
              p.y += p.vy
            }
          }
        }

        const coffeeWake = viscousCoffeeWakeParticlesRef.current
        if (
          viscousCoffee &&
          !entranceActive &&
          coffeeWake != null &&
          coffeeWake.length > 0
        ) {
          assignCoffeeWakeTargets(
            coffeeWake,
            viscousCoffeeTrailRef.current
          )
          integrateCoffeeWakeParticles(coffeeWake)
        }

        const dotDprTick = c2.width / Math.max(1, c2.clientWidth)
        const parallaxX = T.x * PARALLAX_MULT_C
        const parallaxY = T.y * PARALLAX_MULT_C
        drawLayer(
          ctx2,
          c2,
          particles,
          sx,
          sy,
          mouseRef,
          dotDprTick,
          parallaxX,
          parallaxY,
          applyCanvasParallax,
          particleDrawSizeBmpRef.current,
          viscousCoffee ? viscousCoffeeWakeParticlesRef.current : null
        )

        const tiltEl = logoTiltLayerRef.current
        if (tiltEl != null) {
          const cur = logoTiltCurrentRef.current
          const tgt = logoTiltTargetRef.current
          const k = LOGO_TILT_SMOOTHING
          cur.rx += (tgt.rx - cur.rx) * k
          cur.ry += (tgt.ry - cur.ry) * k
          tiltEl.style.transform = `rotateX(${cur.rx}deg) rotateY(${cur.ry}deg)`
        }
      } catch (err) {
        console.error("[HomeParticleLogoHero] RAF step failed:", err)
      } finally {
        frameId = requestAnimationFrame(tick)
        rafRef.current = frameId
      }
    }

    const resume = () => {
      if (frameId == null) {
        frameId = requestAnimationFrame(tick)
        rafRef.current = frameId
      }
    }
    rafResumeRef.current = resume
    resume()

    return () => {
      rafResumeRef.current = () => {}
      if (frameId != null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
      rafRef.current = null
    }
  }, [])

  const applyWindowPointerClient = useCallback(
    (
      clientX: number,
      clientY: number,
      opts?: { recordPointerMove?: boolean }
    ) => {
      lastPointerClientRef.current = { x: clientX, y: clientY }

      if (!MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED) {
        parallaxLRef.current = { x: 0, y: 0 }
        logoTiltTargetRef.current = { rx: 0, ry: 0 }
        return
      }

      const canvas = canvasCRef.current
      if (!canvas || canvas.width <= 0) {
        logoTiltTargetRef.current = { rx: 0, ry: 0 }
        return
      }

      const isFs = presentationRef.current === "fullscreen"
      const { sx, sy } = canvasScale(canvas)
      const raw = clientToBitmapViewport(clientX, clientY, canvas)
      const rawX = Number.isFinite(raw.x) ? raw.x : -9999
      const rawY = Number.isFinite(raw.y) ? raw.y : -9999
      const reducePlx = reduceParallaxRef.current
      const T = parallaxTRef.current
      const Tx = Number.isFinite(T.x) ? T.x : 0
      const Ty = Number.isFinite(T.y) ? T.y : 0
      const hitBx = !reducePlx && !isFs ? Tx * PARALLAX_MULT_C * sx : 0
      const hitBy = !reducePlx && !isFs ? Ty * PARALLAX_MULT_C * sy : 0
      const mx = rawX - hitBx
      const my = rawY - hitBy

      const parts = particlesRef.current
      const b = logoInteractBoundsRef.current
      const nearStipple = pointerInStippleInteractionRange(
        mx,
        my,
        b,
        parts,
        DRAG_RADIUS
      )

      const rect = canvas.getBoundingClientRect()
      const halfW = Math.max(rect.width / 2, 1)
      const halfH = Math.max(rect.height / 2, 1)

      if (nearStipple) {
        const nx = Math.max(
          -1,
          Math.min(
            1,
            (clientX - (rect.left + rect.width / 2)) / halfW
          )
        )
        const ny = Math.max(
          -1,
          Math.min(
            1,
            (clientY - (rect.top + rect.height / 2)) / halfH
          )
        )
        if (!isFs && !reducePlx) {
          parallaxLRef.current = {
            x: nx * PARALLAX_MOUSE_SENSITIVITY,
            y: ny * PARALLAX_MOUSE_SENSITIVITY,
          }
        } else {
          parallaxLRef.current = { x: 0, y: 0 }
        }
        if (!reducePlx) {
          logoTiltTargetRef.current = {
            rx: -ny * LOGO_TILT_MAX_DEG,
            ry: nx * LOGO_TILT_MAX_DEG,
          }
        } else {
          logoTiltTargetRef.current = { rx: 0, ry: 0 }
        }
      } else {
        parallaxLRef.current = { x: 0, y: 0 }
        logoTiltTargetRef.current = { rx: 0, ry: 0 }
      }
    },
    []
  )

  useEffect(() => {
    /** Window `mousemove` / `mousedown` (not document `pointer*`) for reliable hover without activation gating. */
    const syncClient = (clientX: number, clientY: number) => {
      applyWindowPointerClient(clientX, clientY, { recordPointerMove: true })
    }

    const onMouseMove = (e: MouseEvent) => {
      syncClient(e.clientX, e.clientY)
    }

    const onMouseDown = (e: MouseEvent) => {
      syncClient(e.clientX, e.clientY)
    }

    const onResumePointer = () => {
      const lp = lastPointerClientRef.current
      if (lp != null) {
        applyWindowPointerClient(lp.x, lp.y, { recordPointerMove: false })
      } else {
        const hero = wrapRef.current
        if (hero != null) {
          const r = hero.getBoundingClientRect()
          const cx = Math.floor(r.left + r.width / 2)
          const cy = Math.floor(r.top + r.height / 2)
          lastPointerClientRef.current = { x: cx, y: cy }
          applyWindowPointerClient(cx, cy, { recordPointerMove: false })
        } else {
          const { wBox, hBox } = viewportBox()
          const cx = Math.floor(wBox / 2)
          const cy = Math.floor(hBox / 2)
          lastPointerClientRef.current = { x: cx, y: cy }
          applyWindowPointerClient(cx, cy, { recordPointerMove: false })
        }
      }
      rafResumeRef.current()
    }

    const onPointerMove = (e: PointerEvent) => {
      syncClient(e.clientX, e.clientY)
    }

    const clearPointerLeaveDocument = () => {
      lastPointerClientRef.current = null
      mouseRawBmpRef.current = null
      parallaxLRef.current = { x: 0, y: 0 }
      logoTiltTargetRef.current = { rx: 0, ry: 0 }
      logoTiltCurrentRef.current = { rx: 0, ry: 0 }
      const tiltEl = logoTiltLayerRef.current
      if (tiltEl != null) {
        tiltEl.style.transform = "rotateX(0deg) rotateY(0deg)"
      }
      mouseRef.current.x = -9999
      mouseRef.current.y = -9999
      wakeTrailRef.current = []
      viscousCoffeeTrailRef.current = []
      viscousCoffeeErodeAccRef.current = 0
      const cw = viscousCoffeeWakeParticlesRef.current
      if (cw != null) {
        for (const p of cw) {
          p.vx = 0
          p.vy = 0
          p.baseAlpha = 0
        }
      }
    }

    const onDocumentMouseOut = (e: MouseEvent) => {
      const rel = e.relatedTarget as Node | null
      if (rel != null && document.documentElement.contains(rel)) {
        return
      }
      clearPointerLeaveDocument()
    }

    const onWindowBlur = () => {
      clearPointerLeaveDocument()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearPointerLeaveDocument()
      }
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true })
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("mousedown", onMouseDown, { passive: true })
    window.addEventListener("focus", onResumePointer)
    window.addEventListener("pageshow", onResumePointer)
    window.addEventListener("blur", onWindowBlur)
    document.addEventListener("mouseout", onDocumentMouseOut)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("focus", onResumePointer)
      window.removeEventListener("pageshow", onResumePointer)
      window.removeEventListener("blur", onWindowBlur)
      document.removeEventListener("mouseout", onDocumentMouseOut)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [applyWindowPointerClient])

  const stackBaseClass =
    presentation === "fullscreen"
      ? "pointer-events-none fixed inset-0 overflow-hidden bg-ui-fg-base"
      : "pointer-events-none absolute inset-0 overflow-hidden bg-transparent"

  const stackStyle: CSSProperties = {
    pointerEvents: "none",
    zIndex: presentation === "fullscreen" ? 30 : 2,
    ...(mixRevealActive
      ? {
          opacity: isRevealed ? 1 : 0,
          transform: isRevealed ? "translateY(0)" : "translateY(20px)",
          transition: `opacity ${MIX_REVEAL_MS}ms ${MIX_REVEAL_EASE}, transform ${MIX_REVEAL_MS}ms ${MIX_REVEAL_EASE}`,
        }
      : {}),
  }

  const particleStack = (
    <div ref={stackRef} className={stackBaseClass} style={stackStyle}>
      <div
        className="absolute inset-0"
        style={{
          perspective: `${LOGO_TILT_PERSPECTIVE_PX}px`,
          perspectiveOrigin: "50% 42%",
        }}
      >
        <div
          ref={logoTiltLayerRef}
          className="h-full w-full"
          style={{
            transformStyle: "preserve-3d",
            transformOrigin: "50% 42%",
          }}
        >
          {/* Visible until canvas particle raster succeeds; avoids double logo vs stipple */}
          <img
            src={logoSrc}
            alt=""
            decoding="async"
            className={`pointer-events-none absolute left-1/2 z-[5] max-w-[min(96%,80rem)] -translate-x-1/2 -translate-y-1/2 object-contain transition-opacity duration-300 ${
              presentation === "fullscreen"
                ? "top-[48%] max-h-[min(50vh,460px)]"
                : "top-1/2 max-h-[min(58vh,560px)]"
            } ${logoRasterReady ? "opacity-0" : "opacity-100"}`}
            draggable={false}
            aria-hidden={logoRasterReady}
          />
          <canvas
            ref={canvasORef}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[10] block h-full w-full min-h-0 min-w-0 !bg-transparent [background:transparent!important] [image-rendering:auto]"
            style={{
              pointerEvents: "none",
              background: "transparent",
            }}
          />
          <canvas
            ref={canvasARef}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[11] block h-full w-full min-h-0 min-w-0 !bg-transparent [background:transparent!important] [image-rendering:auto]"
            style={{
              pointerEvents: "none",
              background: "transparent",
            }}
          />
          <canvas
            ref={canvasCRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[12] block h-full w-full min-h-0 min-w-0 !bg-transparent [background:transparent!important] [image-rendering:auto]"
            style={{
              pointerEvents: "none",
              background: "transparent",
            }}
          />
        </div>
      </div>
    </div>
  )

  if (loadFailed) {
    if (presentation === "fullscreen") {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center bg-ui-fg-base text-white"
          aria-label="SC Prints"
        >
          <NextImage
            src={FALLBACK_SRC}
            alt="SC Prints"
            width={320}
            height={120}
            className="h-auto w-full max-w-xs object-contain opacity-90"
          />
        </div>
      )
    }
    return (
      <section
        aria-label="SC Prints"
        className="relative flex min-h-[min(72vh,680px)] flex-col bg-black text-white"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
          <NextImage
            src={FALLBACK_SRC}
            alt="SC Prints"
            width={320}
            height={120}
            className="h-auto w-full max-w-xs object-contain opacity-90"
          />
        </div>
      </section>
    )
  }

  if (presentation === "fullscreen") {
    const portalTarget =
      typeof document !== "undefined" ? document.body : null
    return (
      <>
        {portalReady &&
          layerReady &&
          portalTarget &&
          createPortal(particleStack, portalTarget)}
      </>
    )
  }

  return (
    <section
      aria-label={
        sectionAriaLabel ?? "SC Prints — interactive particle logo"
      }
      className="relative flex min-h-[min(72vh,680px)] w-full flex-col overflow-hidden bg-black text-white"
    >
      <div
        ref={(node) => {
          wrapRef.current = node
          setParticleLayerHostReady(node != null)
        }}
        className="relative isolate min-h-[min(72vh,680px)] w-full flex-1 overflow-hidden"
        aria-hidden
      />
      {portalReady &&
        layerReady &&
        typeof document !== "undefined" &&
        wrapRef.current != null &&
        createPortal(particleStack, wrapRef.current)}
    </section>
  )
}
