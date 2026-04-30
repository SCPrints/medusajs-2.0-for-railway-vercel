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
  FULLSCREEN_ASSEMBLE_MS,
  FULLSCREEN_ASSEMBLE_SPRING_MULT,
  FULLSCREEN_FRICTION,
  FULLSCREEN_LOGO_NUDGE_Y_CSS,
  FULLSCREEN_LOGO_PAD,
  FULLSCREEN_PARTICLE_DRAW_SIZE_BMP,
  FULLSCREEN_SPAWN_SPREAD_FRAC,
  FULLSCREEN_SPRING_STIFFNESS,
  FULL_HERO_HOME_FRACTION,
  PARALLAX_EASE,
  PARALLAX_MOUSE_SENSITIVITY,
  PARALLAX_MULT_C,
  MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED,
  MOUSE_CURSOR_WAKE_PHYSICS_ENABLED,
  ANIMATED_PARTICLE_ALPHA_MULT,
  PARTICLE_ALPHA_CAP,
  PARTICLE_ALPHA_MIN,
  PARTICLE_ALPHA_RANGE,
  PARTICLE_REST_SNAP_DIST_BMP,
  PARTICLE_REST_SNAP_VSQ,
  PARTICLE_BRAND_R,
  PARTICLE_BRAND_G,
  PARTICLE_BRAND_B,
  PARTICLE_AMBIENT_R,
  PARTICLE_AMBIENT_G,
  PARTICLE_AMBIENT_B,
  PARTICLE_DRAW_SIZE_BMP,
  PARTICLE_MAX_VELOCITY_BMP,
  PARTICLE_RADIUS_MIN_CSS,
  PARTICLE_RADIUS_RANGE_CSS,
  PHYSICS_DIST_EPSILON,
  PUSH_FORCE,
  PUSH_FALLOFF_POWER,
  SMEAR_FORCE,
  SMEAR_FALLOFF_POWER,
  SETTLE_SLOW_ZONE_BMP,
  SETTLE_SPRING_NEAR_SCALE,
  SETTLE_UNCOUPLED_FRICTION_MULT,
  SETTLE_UNCOUPLED_FRICTION_ZONE_BMP,
  SPRING_GAIN,
  SPRING_STIFFNESS,
  SWIRL_AMP,
  SWIRL_FORCE,
  WOBBLE_AMP_X_CSS,
  WOBBLE_AMP_Y_COS_SCALE,
  WOBBLE_ENERGY_DECAY_PER_SEC,
  WOBBLE_ENERGY_RISE_PER_SEC,
  WOBBLE_RAD_PER_SEC_BASE,
  WOBBLE_Y_ANGLE_SPEED_SCALE,
  SHOW_MOUSE_CURSOR_DEBUG_MARKER,
  POINTER_MOVE_EPS_BMP_SQ,
  POINTER_TRAIL_MEMORY_MS,
  SPOON_SWIRL_SPEED_SCALE,
  SPOON_TRAIL_DRAG,
  TRAIL_PATH_MAX_SAMPLES,
  TRAIL_PATH_MIN_SPACING_BMP,
  TRAIL_PATH_SAMPLE_DECAY,
  TRAIL_PATH_SKIP_NEAR_CURSOR_BMP,
  TRAIL_PATH_SMEAR_MULT,
  TRAIL_PATH_SWIRL_MULT,
  TRAIL_PATH_WAKE_RADIUS_BMP,
  TRAIL_VELOCITY_BLEND,
  TRAIL_VELOCITY_IDLE_RETENTION,
  stippleHash,
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
 * Bitmap-space particles; wobble via `wobbleAngleX` / `wobbleAngleY` advanced each RAF frame.
 */
type ParallaxParticle = {
  hx: number
  hy: number
  /** Current position in bitmap space (integrated from vx, vy). */
  x: number
  y: number
  wobbleAngleX: number
  wobbleAngleY: number
  /** Multiplier on `WOBBLE_RAD_PER_SEC_BASE` (typically ~0.5…1). */
  speed: number
  radiusCss: number
  baseAlpha: number
  /** Velocity in bitmap px/frame. */
  vx: number
  vy: number
  /** Sampled from logo ink mask; ambient hero fill otherwise. */
  fromLogoMask: boolean
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

function drawLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  particles: ParallaxParticle[],
  sx: number,
  sy: number,
  /** 0 = crisp rest logo; 1 = full idle wobble (motion-activated). */
  wobbleAmpScale: number,
  mouseRef: { current: { x: number; y: number } },
  /** Multiply debug dot radius (use backing-store DPR). */
  debugDotDpr: number,
  /** Parallax offset in “CSS px” space: `T.x * PARALLAX_MULT_C` / `T.y * PARALLAX_MULT_C`. */
  parallaxX: number,
  parallaxY: number,
  /** When false, skip `translate` (reduced motion). */
  applyCanvasParallax: boolean,
  drawSizeBmp = PARTICLE_DRAW_SIZE_BMP
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.save()
  if (applyCanvasParallax) {
    ctx.translate(parallaxX * sx, parallaxY * sy)
  }
  const wAmp = Math.max(0, Math.min(1, wobbleAmpScale))
  const d = drawSizeBmp
  for (const p of particles) {
    const ba = Number.isFinite(p.baseAlpha) ? p.baseAlpha : PARTICLE_ALPHA_MIN
    const alpha = Math.min(
      PARTICLE_ALPHA_CAP,
      Math.max(0.1, ba * ANIMATED_PARTICLE_ALPHA_MULT)
    )
    const pr = p.fromLogoMask ? PARTICLE_BRAND_R : PARTICLE_AMBIENT_R
    const pg = p.fromLogoMask ? PARTICLE_BRAND_G : PARTICLE_AMBIENT_G
    const pb = p.fromLogoMask ? PARTICLE_BRAND_B : PARTICLE_AMBIENT_B
    ctx.fillStyle = `rgba(${Math.round(pr)},${Math.round(pg)},${Math.round(pb)},${alpha})`
    let wx = 0
    let wy = 0
    if (wAmp > 0) {
      const ax = Number.isFinite(p.wobbleAngleX) ? p.wobbleAngleX : 0
      const ay = Number.isFinite(p.wobbleAngleY) ? p.wobbleAngleY : 0
      wx = WOBBLE_AMP_X_CSS * Math.sin(ax) * wAmp
      wy =
        WOBBLE_AMP_X_CSS *
        Math.cos(ay) *
        WOBBLE_AMP_Y_COS_SCALE *
        wAmp
    }
    const hx = Number.isFinite(p.hx) ? p.hx : 0
    const hy = Number.isFinite(p.hy) ? p.hy : 0
    const px = Number.isFinite(p.x) ? p.x : hx
    const py = Number.isFinite(p.y) ? p.y : hy
    let xBmp = px + wx * sx
    let yBmp = py + wy * sy
    if (!Number.isFinite(xBmp)) {
      xBmp = px
    }
    if (!Number.isFinite(yBmp)) {
      yBmp = py
    }
    ctx.fillRect(xBmp, yBmp, d, d)
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
}

export default function HomeParticleLogoHero({
  logoSrc = DEFAULT_LOGO_SRC,
  presentation = "embedded",
}: Props) {
  const presentationRef = useRef(presentation)
  presentationRef.current = presentation

  /** Always-on interaction; never set to false. */
  const reducedMotion = useReducedMotion()
  /** Layer parallax respects OS reduced-motion; stipple wobble respects it too. */
  const reduceParallax = reducedMotion === true
  const reduceWobble = reducedMotion === true

  const mousePrevBmpRef = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  /**
   * `performance.now()` when the pointer last moved while near logo stipple (−1 ⇒ never).
   * Black-hero / navbar motion does not refresh this, so parallax and wakes stay off there.
   */
  const lastStipplePointerMoveMsRef = useRef(-1)
  /** Axis-aligned logo home bounds in bitmap px (for fast hit reject). */
  const logoInteractBoundsRef = useRef<LogoInteractBounds | null>(null)
  const trailVelBmpRef = useRef({ x: 0, y: 0 })
  /** Bitmap samples along recent pointer path (coffee-trail wake); cleared when trail expires. */
  const trailPathBmpRef = useRef<Array<{ x: number; y: number }>>([])
  /** Bitmap-space cursor anchor for trail-only swirl/smear locality. */
  const lastFrozenInfluenceBmpRef = useRef({ x: 0, y: 0 })
  /** After load, boost spring so TL-clustered particles snap into the logo. */
  const fullscreenAssembleBoostEndMsRef = useRef(0)
  const particleDrawSizeBmpRef = useRef(PARTICLE_DRAW_SIZE_BMP)

  const reduceParallaxRef = useRef(reduceParallax)
  const reduceWobbleRef = useRef(reduceWobble)
  reduceParallaxRef.current = reduceParallax
  reduceWobbleRef.current = reduceWobble

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
  /** Wall-clock seconds for wobble integration (rad/s × dt). */
  const wobbleClockRef = useRef<number | null>(null)
  /** 0 at rest (crisp logo); ramps toward 1 while the pointer moves over the hero. */
  const wobbleEnergyRef = useRef(0)
  const parallaxLRef = useRef({ x: 0, y: 0 })
  const parallaxTRef = useRef({ x: 0, y: 0 })
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
    const cap = ANIMATED_PARTICLE_CAP
    const heroHomeCount =
      nLogo > 0
        ? Math.min(cap, Math.round(cap * FULL_HERO_HOME_FRACTION))
        : cap
    const logoHomeCount = cap - heroHomeCount
    const particles: ParallaxParticle[] = []

    for (let k = 0; k < heroHomeCount; k++) {
      const hx = Math.random() * Math.max(1, W - 1)
      const hy = Math.random() * Math.max(1, H - 1)
      const phase = stippleHash(k + 901, k * 17 + W) * Math.PI * 2 + k * 0.001
      const speedMul = 0.5 + stippleHash(k, hx + hy) * 0.5
      particles.push({
        hx,
        hy,
        x: hx,
        y: hy,
        wobbleAngleX: phase,
        wobbleAngleY: phase * 1.03,
        speed: speedMul,
        radiusCss:
          PARTICLE_RADIUS_MIN_CSS +
          stippleHash(k, hx + hy) * PARTICLE_RADIUS_RANGE_CSS,
        baseAlpha:
          PARTICLE_ALPHA_MIN + stippleHash(hy, k * 31) * PARTICLE_ALPHA_RANGE,
        vx: 0,
        vy: 0,
        fromLogoMask: false,
      })
    }

    for (let k = 0; k < logoHomeCount; k++) {
      const randomIndex = Math.floor(Math.random() * nLogo)
      const { x: hxRaw, y: hyRaw } = candidates[randomIndex]!
      const hx = (Number(hxRaw) || 0) + (Math.random() * 2 - 1)
      const hy = (Number(hyRaw) || 0) + (Math.random() * 2 - 1)
      const phase = stippleHash(k + 17, hyRaw) * Math.PI * 2 + k * 0.001
      const speedMul = 0.5 + stippleHash(hxRaw, k) * 0.5
      particles.push({
        hx,
        hy,
        x: hx,
        y: hy,
        wobbleAngleX: phase,
        wobbleAngleY: phase * 1.03,
        speed: speedMul,
        radiusCss:
          PARTICLE_RADIUS_MIN_CSS +
          stippleHash(k, hxRaw + hyRaw) * PARTICLE_RADIUS_RANGE_CSS,
        baseAlpha:
          PARTICLE_ALPHA_MIN + stippleHash(hyRaw, k * 31) * PARTICLE_ALPHA_RANGE,
        vx: 0,
        vy: 0,
        fromLogoMask: true,
      })
    }

    if (isFsBuild) {
      particleDrawSizeBmpRef.current = FULLSCREEN_PARTICLE_DRAW_SIZE_BMP
      if (!reduceWobbleRef.current) {
        const spread = Math.min(W, H) * FULLSCREEN_SPAWN_SPREAD_FRAC
        const tlx = W * 0.02
        const tly = H * 0.025
        for (const p of particles) {
          const xh = Number.isFinite(p.hx) ? p.hx : 0
          const yh = Number.isFinite(p.hy) ? p.hy : 0
          p.x = tlx + stippleHash(xh, yh) * spread
          p.y = tly + stippleHash(yh, xh + 17) * spread
          p.vx = 0
          p.vy = 0
        }
        fullscreenAssembleBoostEndMsRef.current =
          performance.now() + FULLSCREEN_ASSEMBLE_MS
      } else {
        fullscreenAssembleBoostEndMsRef.current = 0
      }
    } else {
      particleDrawSizeBmpRef.current = PARTICLE_DRAW_SIZE_BMP
      fullscreenAssembleBoostEndMsRef.current = 0
    }

    parallaxTRef.current = { x: 0, y: 0 }
    parallaxLRef.current = { x: 0, y: 0 }
    trailVelBmpRef.current = { x: 0, y: 0 }
    trailPathBmpRef.current.length = 0

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
    wobbleEnergyRef.current = 0
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
      0,
      mouseRef,
      dotDpr,
      0,
      0,
      !reduceParallax && !fs,
      particleDrawSizeBmpRef.current
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
      mousePrevBmpRef.current = { x: sb.x, y: sb.y }
      lastFrozenInfluenceBmpRef.current = {
        x: Number.isFinite(sb.x) ? sb.x : W * 0.5,
        y: Number.isFinite(sb.y) ? sb.y : H * 0.5,
      }
    }
  }, [logoImg, reduceWobble, reduceParallax])

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
        const reduceWobbleNow = reduceWobbleRef.current

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
        const friction = isFs ? FULLSCREEN_FRICTION : FRICTION
        const springKBase = isFs ? FULLSCREEN_SPRING_STIFFNESS : SPRING_STIFFNESS
        const assembleMult =
          isFs &&
          performance.now() < fullscreenAssembleBoostEndMsRef.current
            ? FULLSCREEN_ASSEMBLE_SPRING_MULT
            : 1
        const springK = springKBase * assembleMult
        const nowSec = performance.now() / 1000
        const prevSec = wobbleClockRef.current
        wobbleClockRef.current = nowSec
        const dt =
          prevSec != null
            ? Math.min(0.1, Math.max(0, nowSec - prevSec))
            : 1 / 60
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

        /** Same scale as `drawLayer` `ctx.translate(T * MULT * sx, …)`. */
        const hitBx = applyCanvasParallax ? T.x * PARALLAX_MULT_C * sx : 0
        const hitBy = applyCanvasParallax ? T.y * PARALLAX_MULT_C * sy : 0

        let currentMouseX = -9999
        let currentMouseY = -9999
        if (raw != null && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
          currentMouseX = raw.x - hitBx
          currentMouseY = raw.y - hitBy
        } else if (c2.width > 0) {
          const rr = c2.getBoundingClientRect()
          const ctr = clientToBitmapViewport(
            rr.left + rr.width * 0.5,
            rr.top + rr.height * 0.5,
            c2
          )
          currentMouseX = ctr.x - hitBx
          currentMouseY = ctr.y - hitBy
        }

        mouseRef.current.x = currentMouseX
        mouseRef.current.y = currentMouseY

        const pm = mousePrevBmpRef.current
        let mouseDeltaX = 0
        let mouseDeltaY = 0
        const pointerMapped =
          mouseRef.current.active &&
          Number.isFinite(currentMouseX) &&
          Number.isFinite(currentMouseY) &&
          currentMouseX > -9000 &&
          raw != null
        if (pointerMapped) {
          mouseDeltaX = currentMouseX - pm.x
          mouseDeltaY = currentMouseY - pm.y
        }
        pm.x = currentMouseX
        pm.y = currentMouseY
        mouseRef.current.deltaX = mouseDeltaX
        mouseRef.current.deltaY = mouseDeltaY

        const nowMsClock = performance.now()
        const nearStipple = pointerInStippleInteractionRange(
          currentMouseX,
          currentMouseY,
          logoInteractBoundsRef.current,
          particles,
          DRAG_RADIUS
        )

        const mouseMovedBmp =
          pointerMapped &&
          mouseDeltaX * mouseDeltaX + mouseDeltaY * mouseDeltaY >
            POINTER_MOVE_EPS_BMP_SQ

        let idleSinceStippleMoveMs =
          lastStipplePointerMoveMsRef.current < 0
            ? Number.POSITIVE_INFINITY
            : nowMsClock - lastStipplePointerMoveMsRef.current

        const wakeWindowActiveForReset =
          lastStipplePointerMoveMsRef.current >= 0 &&
          idleSinceStippleMoveMs < POINTER_TRAIL_MEMORY_MS

        if (
          pointerMapped &&
          mouseMovedBmp &&
          (presentationRef.current === "fullscreen" ||
            nearStipple ||
            wakeWindowActiveForReset)
        ) {
          lastStipplePointerMoveMsRef.current = nowMsClock
          idleSinceStippleMoveMs = 0
        }

        const cursorCoupled =
          MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED &&
          pointerMapped &&
          lastStipplePointerMoveMsRef.current >= 0 &&
          idleSinceStippleMoveMs < POINTER_TRAIL_MEMORY_MS

        if (!cursorCoupled && !reduceParallaxNow && !isFs) {
          parallaxLRef.current = { x: 0, y: 0 }
        }

        const tv = trailVelBmpRef.current
        const blendTrail = TRAIL_VELOCITY_BLEND

        if (MOUSE_CURSOR_WAKE_PHYSICS_ENABLED && cursorCoupled) {
          if (mouseMovedBmp) {
            tv.x = tv.x * (1 - blendTrail) + mouseDeltaX * blendTrail
            tv.y = tv.y * (1 - blendTrail) + mouseDeltaY * blendTrail
          } else {
            tv.x *= TRAIL_VELOCITY_IDLE_RETENTION
            tv.y *= TRAIL_VELOCITY_IDLE_RETENTION
          }
        } else {
          tv.x *= 0.88
          tv.y *= 0.88
        }

        if (cursorCoupled) {
          const fr = lastFrozenInfluenceBmpRef.current
          fr.x = currentMouseX
          fr.y = currentMouseY
        }

        const trailPath = trailPathBmpRef.current
        if (!cursorCoupled) {
          trailPath.length = 0
        } else if (
          pointerMapped &&
          mouseMovedBmp &&
          MOUSE_CURSOR_WAKE_PHYSICS_ENABLED
        ) {
          const minD2 =
            TRAIL_PATH_MIN_SPACING_BMP * TRAIL_PATH_MIN_SPACING_BMP
          const last = trailPath[trailPath.length - 1]
          if (!last) {
            trailPath.push({ x: currentMouseX, y: currentMouseY })
          } else {
            const jx = currentMouseX - last.x
            const jy = currentMouseY - last.y
            if (jx * jx + jy * jy >= minD2) {
              trailPath.push({ x: currentMouseX, y: currentMouseY })
              while (trailPath.length > TRAIL_PATH_MAX_SAMPLES) {
                trailPath.shift()
              }
            }
          }
        }

        const infXBmp = cursorCoupled
          ? lastFrozenInfluenceBmpRef.current.x
          : -9999
        const infYBmp = cursorCoupled
          ? lastFrozenInfluenceBmpRef.current.y
          : -9999

        const tvMagForSwirl = Math.hypot(tv.x, tv.y)
        const spoonBoostFrame =
          1 + SPOON_SWIRL_SPEED_SCALE * Math.min(tvMagForSwirl, 14)

        let pathWakeDx = 0
        let pathWakeDy = 0
        let pathWakeOn = false
        if (
          MOUSE_CURSOR_WAKE_PHYSICS_ENABLED &&
          cursorCoupled &&
          pointerMapped
        ) {
          pathWakeOn = true
          if (mouseMovedBmp) {
            pathWakeDx = mouseDeltaX
            pathWakeDy = mouseDeltaY
          } else {
            pathWakeDx = tv.x * SPOON_TRAIL_DRAG
            pathWakeDy = tv.y * SPOON_TRAIL_DRAG
          }
        }

        const springGainMult = SPRING_GAIN

        let wobbleEnergy = wobbleEnergyRef.current
        if (reduceWobbleNow || !cursorCoupled) {
          wobbleEnergy = 0
        } else {
          if (
            MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED &&
            mouseRef.current.active &&
            mouseMovedBmp &&
            pointerMapped &&
            (presentationRef.current === "fullscreen" || nearStipple)
          ) {
            wobbleEnergy = Math.min(
              1,
              wobbleEnergy + WOBBLE_ENERGY_RISE_PER_SEC * dt
            )
          } else {
            wobbleEnergy = Math.max(
              0,
              wobbleEnergy - WOBBLE_ENERGY_DECAY_PER_SEC * dt
            )
          }
        }
        wobbleEnergyRef.current = wobbleEnergy
        const wobbleAmpScale = reduceWobbleNow ? 0 : wobbleEnergy

        if (!reduceWobbleNow && wobbleEnergy > 0.001) {
          for (const p of particles) {
            const mul =
              Number.isFinite(p.speed) && p.speed > 0 ? p.speed : 1
            const dAngle = WOBBLE_RAD_PER_SEC_BASE * mul * dt
            p.wobbleAngleX += dAngle
            p.wobbleAngleY += dAngle * WOBBLE_Y_ANGLE_SPEED_SCALE
          }
        }

        const Wbmp = Math.max(1, c2.width)
        const Hbmp = Math.max(1, c2.height)
        const margin = particleDrawSizeBmpRef.current * 0.5
        const xMinClamp = margin
        const xMaxClamp = Math.max(xMinClamp + 1e-6, Wbmp - margin)
        const yMinClamp = margin
        const yMaxClamp = Math.max(yMinClamp + 1e-6, Hbmp - margin)

        const influenceR = DRAG_RADIUS
        const pathLen = trailPath.length

        for (const p of particles) {
          const hx = Number.isFinite(p.hx) ? p.hx : 0
          const hy = Number.isFinite(p.hy) ? p.hy : 0
          let x = Number.isFinite(p.x) ? p.x : hx
          let y = Number.isFinite(p.y) ? p.y : hy
          let vx = Number.isFinite(p.vx) ? p.vx : 0
          let vy = Number.isFinite(p.vy) ? p.vy : 0

          const dx = x - infXBmp
          const dy = y - infYBmp
          const dist = Math.hypot(dx, dy)
          const falloff =
            Number.isFinite(dist) &&
            Number.isFinite(infXBmp) &&
            Number.isFinite(infYBmp) &&
            infXBmp > -9000 &&
            dist < influenceR
              ? Math.max(0, 1 - dist / influenceR)
              : 0

          const inv = dist > PHYSICS_DIST_EPSILON ? 1 / dist : 0
          const nx = dx * inv
          const ny = dy * inv

          const allowPush =
            MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED &&
            cursorCoupled &&
            pointerMapped

          if (allowPush && falloff > 0) {
            const pushW = Math.pow(falloff, PUSH_FALLOFF_POWER)
            vx += nx * pushW * PUSH_FORCE
            vy += ny * pushW * PUSH_FORCE
          }

          if (MOUSE_CURSOR_WAKE_PHYSICS_ENABLED && falloff > 0) {
            const smearW = Math.pow(falloff, SMEAR_FALLOFF_POWER)
            let wakeDx = 0
            let wakeDy = 0
            let swirlScale = 0
            if (cursorCoupled && pointerMapped) {
              if (mouseMovedBmp) {
                wakeDx = mouseDeltaX
                wakeDy = mouseDeltaY
              } else {
                wakeDx = tv.x * SPOON_TRAIL_DRAG
                wakeDy = tv.y * SPOON_TRAIL_DRAG
              }
              swirlScale = 1
            }
            if (swirlScale > 1e-4 || wakeDx !== 0 || wakeDy !== 0) {
              vx += wakeDx * smearW * SMEAR_FORCE
              vy += wakeDy * smearW * SMEAR_FORCE
              const swirl =
                smearW *
                SWIRL_FORCE *
                SWIRL_AMP *
                swirlScale *
                spoonBoostFrame
              vx += ny * swirl
              vy -= nx * swirl
            }
          }

          if (
            pathWakeOn &&
            pathLen > 0 &&
            (pathWakeDx !== 0 ||
              pathWakeDy !== 0 ||
              tvMagForSwirl > 1e-6)
          ) {
            const skipNear2 =
              TRAIL_PATH_SKIP_NEAR_CURSOR_BMP *
              TRAIL_PATH_SKIP_NEAR_CURSOR_BMP
            for (let pi = 0; pi < pathLen; pi++) {
              const sample = trailPath[pi]
              if (!sample) {
                continue
              }
              const cdx = currentMouseX - sample.x
              const cdy = currentMouseY - sample.y
              if (cdx * cdx + cdy * cdy < skipNear2) {
                continue
              }
              const pdx = x - sample.x
              const pdy = y - sample.y
              const pd = Math.hypot(pdx, pdy)
              if (
                pd >= TRAIL_PATH_WAKE_RADIUS_BMP ||
                pd < PHYSICS_DIST_EPSILON
              ) {
                continue
              }
              const ageW = Math.pow(
                TRAIL_PATH_SAMPLE_DECAY,
                pathLen - 1 - pi
              )
              const pathFall = Math.pow(
                1 - pd / TRAIL_PATH_WAKE_RADIUS_BMP,
                SMEAR_FALLOFF_POWER
              )
              const pathW = pathFall * ageW
              vx += pathWakeDx * SMEAR_FORCE * TRAIL_PATH_SMEAR_MULT * pathW
              vy += pathWakeDy * SMEAR_FORCE * TRAIL_PATH_SMEAR_MULT * pathW
              const invp = 1 / pd
              const snx = pdx * invp
              const sny = pdy * invp
              const pathSwirl =
                pathW *
                SWIRL_FORCE *
                SWIRL_AMP *
                spoonBoostFrame *
                TRAIL_PATH_SWIRL_MULT
              vx += sny * pathSwirl
              vy -= snx * pathSwirl
            }
          }

          const homeDx = hx - x
          const homeDy = hy - y
          const homeDist = Math.hypot(homeDx, homeDy)

          const settleT = Math.min(
            1,
            homeDist / Math.max(1e-6, SETTLE_SLOW_ZONE_BMP)
          )
          const settleSpringMul =
            SETTLE_SPRING_NEAR_SCALE +
            (1 - SETTLE_SPRING_NEAR_SCALE) * settleT * settleT
          vx +=
            homeDx *
            springK *
            springGainMult *
            settleSpringMul
          vy +=
            homeDy *
            springK *
            springGainMult *
            settleSpringMul
          let frictionUse = friction
          if (
            !cursorCoupled &&
            homeDist < SETTLE_UNCOUPLED_FRICTION_ZONE_BMP
          ) {
            frictionUse *= SETTLE_UNCOUPLED_FRICTION_MULT
          }
          vx *= frictionUse
          vy *= frictionUse
          const vmax = PARTICLE_MAX_VELOCITY_BMP
          const vSq = vx * vx + vy * vy
          if (vSq > vmax * vmax) {
            const s = vmax / Math.sqrt(vSq)
            vx *= s
            vy *= s
          }
          x += vx
          y += vy

          if (x <= xMinClamp) {
            x = xMinClamp
            if (vx < 0) {
              vx = 0
            }
          }
          if (x >= xMaxClamp) {
            x = xMaxClamp
            if (vx > 0) {
              vx = 0
            }
          }
          if (y <= yMinClamp) {
            y = yMinClamp
            if (vy < 0) {
              vy = 0
            }
          }
          if (y >= yMaxClamp) {
            y = yMaxClamp
            if (vy > 0) {
              vy = 0
            }
          }

          if (!Number.isFinite(vx)) {
            vx = 0
          }
          if (!Number.isFinite(vy)) {
            vy = 0
          }

          p.vx = vx
          p.vy = vy
          p.x = x
          p.y = y
        }

        if (!cursorCoupled) {
          for (const p of particles) {
            const hx0 = Number.isFinite(p.hx) ? p.hx : 0
            const hy0 = Number.isFinite(p.hy) ? p.hy : 0
            const px0 = Number.isFinite(p.x) ? p.x : hx0
            const py0 = Number.isFinite(p.y) ? p.y : hy0
            const vx0 = Number.isFinite(p.vx) ? p.vx : 0
            const vy0 = Number.isFinite(p.vy) ? p.vy : 0
            const dHome = Math.hypot(px0 - hx0, py0 - hy0)
            const vSq = vx0 * vx0 + vy0 * vy0
            if (
              dHome < PARTICLE_REST_SNAP_DIST_BMP &&
              vSq < PARTICLE_REST_SNAP_VSQ
            ) {
              p.x = hx0
              p.y = hy0
              p.vx = 0
              p.vy = 0
            }
          }
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
          wobbleAmpScale,
          mouseRef,
          dotDprTick,
          parallaxX,
          parallaxY,
          applyCanvasParallax,
          particleDrawSizeBmpRef.current
        )
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
        return
      }

      const canvas = canvasCRef.current
      if (!canvas || canvas.width <= 0) {
        return
      }

      if (presentationRef.current === "fullscreen") {
        parallaxLRef.current = { x: 0, y: 0 }
        return
      }

      const { sx, sy } = canvasScale(canvas)
      const raw = clientToBitmapViewport(clientX, clientY, canvas)
      const rawX = Number.isFinite(raw.x) ? raw.x : -9999
      const rawY = Number.isFinite(raw.y) ? raw.y : -9999
      const reducePlx = reduceParallaxRef.current
      const T = parallaxTRef.current
      const Tx = Number.isFinite(T.x) ? T.x : 0
      const Ty = Number.isFinite(T.y) ? T.y : 0
      const hitBx = !reducePlx ? Tx * PARALLAX_MULT_C * sx : 0
      const hitBy = !reducePlx ? Ty * PARALLAX_MULT_C * sy : 0
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
        const nx = (clientX - (rect.left + rect.width / 2)) / halfW
        const ny = (clientY - (rect.top + rect.height / 2)) / halfH
        parallaxLRef.current = {
          x: nx * PARALLAX_MOUSE_SENSITIVITY,
          y: ny * PARALLAX_MOUSE_SENSITIVITY,
        }
      } else {
        parallaxLRef.current = { x: 0, y: 0 }
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
      lastStipplePointerMoveMsRef.current = -1
      trailVelBmpRef.current = { x: 0, y: 0 }
      trailPathBmpRef.current.length = 0
      parallaxLRef.current = { x: 0, y: 0 }
      mouseRef.current.x = -9999
      mouseRef.current.y = -9999
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
      aria-label="SC Prints — interactive particle logo"
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
