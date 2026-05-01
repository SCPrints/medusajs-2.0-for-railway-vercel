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
  FULLSCREEN_ASSEMBLE_MS,
  FULLSCREEN_ASSEMBLE_SPRING_MULT,
  FULLSCREEN_LOGO_NUDGE_Y_CSS,
  FULLSCREEN_LOGO_PAD,
  FULLSCREEN_PARTICLE_DRAW_SIZE_BMP,
  FULLSCREEN_SPAWN_SPREAD_FRAC,
  MOUSE_CURSOR_STIPPLE_COUPLED_EFFECTS_ENABLED,
  ANIMATED_PARTICLE_ALPHA_MULT,
  PARTICLE_ALPHA_CAP,
  PARTICLE_BASE_ALPHA,
  PARTICLE_BRAND_R,
  PARTICLE_BRAND_G,
  PARTICLE_BRAND_B,
  PARTICLE_AMBIENT_R,
  PARTICLE_AMBIENT_G,
  PARTICLE_AMBIENT_B,
  PARTICLE_DRAW_SIZE_BMP,
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
 * Bitmap-space particles; position integrated in the RAF fluid loop only.
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
  const d = drawSizeBmp
  for (const p of particles) {
    const ba = Number.isFinite(p.baseAlpha) ? p.baseAlpha : PARTICLE_BASE_ALPHA
    const alpha = Math.min(
      PARTICLE_ALPHA_CAP,
      Math.max(0.1, ba * ANIMATED_PARTICLE_ALPHA_MULT)
    )
    const pr = p.fromLogoMask ? PARTICLE_BRAND_R : PARTICLE_AMBIENT_R
    const pg = p.fromLogoMask ? PARTICLE_BRAND_G : PARTICLE_AMBIENT_G
    const pb = p.fromLogoMask ? PARTICLE_BRAND_B : PARTICLE_AMBIENT_B
    ctx.fillStyle = `rgba(${Math.round(pr)},${Math.round(pg)},${Math.round(pb)},${alpha})`
    const hx = Number.isFinite(p.hx) ? p.hx : 0
    const hy = Number.isFinite(p.hy) ? p.hy : 0
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
  /** Layer parallax respects OS reduced-motion. */
  const reduceParallax = reducedMotion === true

  /** Axis-aligned logo home bounds in bitmap px (for fast hit reject). */
  const logoInteractBoundsRef = useRef<LogoInteractBounds | null>(null)
  /** Fullscreen fly-in: `performance.now()` ceiling while spring boost applies. */
  const fullscreenAssembleBoostEndMsRef = useRef(0)
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
      })
    }

    if (isFsBuild) {
      particleDrawSizeBmpRef.current = FULLSCREEN_PARTICLE_DRAW_SIZE_BMP
      if (!reduceParallaxRef.current) {
        const spread = Math.min(W, H) * FULLSCREEN_SPAWN_SPREAD_FRAC
        const tlx = W * 0.02 - spread * 0.38
        const tly = H * 0.0225
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i]!
          const u = ((i * 2654435761) >>> 0) / 4294967296
          const v = ((i * 2246822519) >>> 0) / 4294967296
          p.x = tlx + u * spread
          p.y = tly + v * spread
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
    }
  }, [logoImg, reduceParallax])

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

        const assembleSpringMult =
          isFs && performance.now() < fullscreenAssembleBoostEndMsRef.current
            ? FULLSCREEN_ASSEMBLE_SPRING_MULT
            : 1
        const springK = SPRING_STIFFNESS * assembleSpringMult

        for (const p of particles) {
          const dx = p.x - currentMouseX
          const dy = p.y - currentMouseY
          const dist = Math.hypot(dx, dy)

          if (
            dist < DRAG_RADIUS &&
            currentMouseX > -9000 &&
            dist >= PHYSICS_DIST_EPSILON
          ) {
            const t = (DRAG_RADIUS - dist) / DRAG_RADIUS
            const force = Math.pow(
              Math.max(0, Math.min(1, t)),
              PUSH_REPULSE_FALLOFF_POWER
            )
            const inv = 1 / dist
            const ux = dx * inv
            const uy = dy * inv
            const pushX = ux * force * PUSH_FORCE
            const pushY = uy * force * PUSH_FORCE
            const swirlX = uy * force * SWIRL_FORCE
            const swirlY = -ux * force * SWIRL_FORCE
            p.vx += pushX + swirlX
            p.vy += pushY + swirlY
          }

          p.vx += (p.hx - p.x) * springK
          p.vy += (p.hy - p.y) * springK
          p.vx *= FRICTION
          p.vy *= FRICTION
          p.x += p.vx
          p.y += p.vy
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
