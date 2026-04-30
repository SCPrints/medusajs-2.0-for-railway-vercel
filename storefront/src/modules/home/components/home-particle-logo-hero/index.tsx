"use client"

import NextImage from "next/image"
import { useReducedMotion } from "framer-motion"
import { createPortal } from "react-dom"
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
  PARALLAX_EASE,
  PARALLAX_MOUSE_SENSITIVITY,
  PARALLAX_MULT_C,
  PARTICLE_ALPHA_MIN,
  PARTICLE_ALPHA_RANGE,
  PARTICLE_DRAW_SIZE_BMP,
  PARTICLE_FILL_STYLE,
  PARTICLE_RADIUS_MIN_CSS,
  PARTICLE_RADIUS_RANGE_CSS,
  PHYSICS_DIST_EPSILON,
  PUSH_FORCE,
  SMEAR_FORCE,
  SPRING_GAIN,
  SPRING_STIFFNESS,
  SWIRL_FORCE,
  WOBBLE_AMP_X_CSS,
  WOBBLE_AMP_Y_COS_SCALE,
  WOBBLE_ENERGY_DECAY_PER_SEC,
  WOBBLE_ENERGY_RISE_PER_SEC,
  WOBBLE_RAD_PER_SEC_BASE,
  WOBBLE_Y_ANGLE_SPEED_SCALE,
  stippleHash,
} from "./constants"

const DEFAULT_LOGO_SRC = "/branding/sc-prints-logo-transparent.png"
const FALLBACK_SRC = "/branding/sc-prints-logo-white.png"

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
  applyCanvasParallax: boolean
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = false
  ctx.save()
  if (applyCanvasParallax) {
    ctx.translate(parallaxX * sx, parallaxY * sy)
  }
  ctx.fillStyle = PARTICLE_FILL_STYLE
  const wAmp = Math.max(0, Math.min(1, wobbleAmpScale))
  const d = PARTICLE_DRAW_SIZE_BMP
  for (const p of particles) {
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
  if (Number.isFinite(m.x) && Number.isFinite(m.y) && m.x > -9000) {
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
}

export default function HomeParticleLogoHero({ logoSrc = DEFAULT_LOGO_SRC }: Props) {
  /** Always-on interaction; never set to false. */
  const reducedMotion = useReducedMotion()
  /** Layer parallax respects OS reduced-motion; stipple wobble respects it too. */
  const reduceParallax = reducedMotion === true
  const reduceWobble = reducedMotion === true

  const mousePrevBmpRef = useRef<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })

  const reduceParallaxRef = useRef(reduceParallax)
  const reduceWobbleRef = useRef(reduceWobble)
  reduceParallaxRef.current = reduceParallax
  reduceWobbleRef.current = reduceWobble

  const wrapRef = useRef<HTMLDivElement>(null)
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
  /** Kept in sync with `syncGlobalPointerFromClient` for RAF and global listeners. */
  const applyPointerClientRef = useRef<(clientX: number, clientY: number) => void>(
    () => {}
  )
  /** Last pointer position in viewport px; recomputed to bitmap each RAF while active. */
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
  /** Client-only: avoid SSR mismatch; portal mounts canvases to `document.body`. */
  const [portalReady, setPortalReady] = useState(false)
  const logoImgRef = useRef<HTMLImageElement | null>(null)
  logoImgRef.current = logoImg

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
    /** Backing store: viewport CSS px × dpr only (no `100vw` rounding here). */
    const W = Math.round(iw * dpr)
    const H = Math.round(ih * dpr)

    for (const c of [c0, c1, c2]) {
      c.width = W
      c.height = H
      c.style.width = "100vw"
      c.style.height = "100vh"
    }

    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const pad = 0.985
    const logoScale = Math.min((W * pad) / nw, (H * pad) / nh)
    const dw = nw * logoScale
    const dh = nh * logoScale
    /** Physics mask centered in bitmap W×H (`W`/`H` ≡ viewport × dpr). */
    const dx = (W - nw * logoScale) / 2
    const dy = (H - nh * logoScale) / 2

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
      })
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
    wobbleEnergyRef.current = 0
    const { sx, sy } = canvasScale(c0)

    ctx0.clearRect(0, 0, c0.width, c0.height)
    ctx1.clearRect(0, 0, c1.width, c1.height)

    const dotDpr = c2.width / Math.max(1, c2.clientWidth)
    drawLayer(ctx2, c2, particles, sx, sy, 0, mouseRef, dotDpr, 0, 0, !reduceParallax)

    setLogoRasterReady(particles.length > 0)

    if (lastPointerClientRef.current == null) {
      const { wBox, hBox } = viewportBox()
      applyPointerClientRef.current(
        Math.floor(wBox / 2),
        Math.floor(hBox / 2)
      )
    }

    const lc = lastPointerClientRef.current
    if (lc != null) {
      const sb = clientToBitmapViewport(lc.x, lc.y, c2)
      mousePrevBmpRef.current = { x: sb.x, y: sb.y }
    }
  }, [logoImg, reduceWobble, reduceParallax])

  buildRef.current = build

  useLayoutEffect(() => {
    if (!portalReady) {
      return
    }
    build()
  }, [build, portalReady])

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
        if (!reduceParallaxNow) {
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

        const lp = lastPointerClientRef.current
        if (lp != null) {
          applyPointerClientRef.current(lp.x, lp.y)
        }

        const raw = mouseRawBmpRef.current
        const iwRaf = Math.max(1, window.innerWidth)
        const ihRaf = Math.max(1, window.innerHeight)
        const dpr = backingDpr()
        const hitBx = !reduceParallaxNow ? T.x * PARALLAX_MULT_C * dpr : 0
        const hitBy = !reduceParallaxNow ? T.y * PARALLAX_MULT_C * dpr : 0

        let currentMouseX = -9999
        let currentMouseY = -9999
        if (raw != null) {
          currentMouseX = raw.x - hitBx
          currentMouseY = raw.y - hitBy
        } else {
          const ctr = clientToBitmapViewport(iwRaf * 0.5, ihRaf * 0.5, c2)
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
          currentMouseX > -9000
        if (pointerMapped) {
          mouseDeltaX = currentMouseX - pm.x
          mouseDeltaY = currentMouseY - pm.y
        }
        pm.x = currentMouseX
        pm.y = currentMouseY
        mouseRef.current.deltaX = mouseDeltaX
        mouseRef.current.deltaY = mouseDeltaY

        let wobbleEnergy = wobbleEnergyRef.current
        if (reduceWobbleNow) {
          wobbleEnergy = 0
        } else {
          if (mouseRef.current.active && pointerMapped) {
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

        for (const p of particles) {
          const hx = Number.isFinite(p.hx) ? p.hx : 0
          const hy = Number.isFinite(p.hy) ? p.hy : 0
          let x = Number.isFinite(p.x) ? p.x : hx
          let y = Number.isFinite(p.y) ? p.y : hy
          let vx = Number.isFinite(p.vx) ? p.vx : 0
          let vy = Number.isFinite(p.vy) ? p.vy : 0

          const dx = x - currentMouseX
          const dy = y - currentMouseY
          const dist = Math.hypot(dx, dy)
          const falloff =
            Number.isFinite(dist) &&
            Number.isFinite(currentMouseX) &&
            Number.isFinite(currentMouseY) &&
            dist < DRAG_RADIUS
              ? Math.max(0, 1 - dist / DRAG_RADIUS)
              : 0
          const inv = dist > PHYSICS_DIST_EPSILON ? 1 / dist : 0
          const nx = dx * inv
          const ny = dy * inv
          vx += nx * falloff * PUSH_FORCE
          vy += ny * falloff * PUSH_FORCE
          vx += mouseDeltaX * falloff * SMEAR_FORCE
          vy += mouseDeltaY * falloff * SMEAR_FORCE
          const swirl = falloff * SWIRL_FORCE * 1.5
          vx += ny * swirl
          vy -= nx * swirl

          const homeDx = hx - x
          const homeDy = hy - y
          vx += homeDx * SPRING_STIFFNESS * SPRING_GAIN
          vy += homeDy * SPRING_STIFFNESS * SPRING_GAIN
          vx *= FRICTION
          vy *= FRICTION
          x += vx
          y += vy

          if (!Number.isFinite(vx)) {
            vx = 0
          }
          if (!Number.isFinite(vy)) {
            vy = 0
          }
          if (!Number.isFinite(x)) {
            x = hx
          }
          if (!Number.isFinite(y)) {
            y = hy
          }

          p.vx = vx
          p.vy = vy
          p.x = x
          p.y = y
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
          !reduceParallaxNow
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

  const applyPointerClientCoords = useCallback((clientX: number, clientY: number) => {
    lastPointerClientRef.current = { x: clientX, y: clientY }

    const canvas = canvasCRef.current
    const bmp = clientToBitmapViewport(clientX, clientY, canvas)
    mouseRawBmpRef.current = {
      x: Number.isFinite(bmp.x) ? bmp.x : -9999,
      y: Number.isFinite(bmp.y) ? bmp.y : -9999,
    }
    mouseRef.current.x = mouseRawBmpRef.current.x
    mouseRef.current.y = mouseRawBmpRef.current.y

    const iw = Math.max(1, window.innerWidth)
    const ih = Math.max(1, window.innerHeight)
    const nx = (clientX - iw * 0.5) / Math.max(1, iw * 0.5)
    const ny = (clientY - ih * 0.5) / Math.max(1, ih * 0.5)
    parallaxLRef.current = {
      x: nx * PARALLAX_MOUSE_SENSITIVITY,
      y: ny * PARALLAX_MOUSE_SENSITIVITY,
    }
  }, [])

  applyPointerClientRef.current = applyPointerClientCoords

  useEffect(() => {
    /** Window `mousemove` / `mousedown` (not document `pointer*`) for reliable hover without activation gating. */
    const syncClient = (clientX: number, clientY: number) => {
      applyPointerClientRef.current(clientX, clientY)
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
        applyPointerClientRef.current(lp.x, lp.y)
      } else {
        const { wBox, hBox } = viewportBox()
        const cx = Math.floor(wBox / 2)
        const cy = Math.floor(hBox / 2)
        lastPointerClientRef.current = { x: cx, y: cy }
        applyPointerClientRef.current(cx, cy)
      }
      rafResumeRef.current()
    }

    window.addEventListener("mousemove", onMouseMove, { passive: true })
    window.addEventListener("mousedown", onMouseDown, { passive: true })
    window.addEventListener("focus", onResumePointer)
    window.addEventListener("pageshow", onResumePointer)

    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("focus", onResumePointer)
      window.removeEventListener("pageshow", onResumePointer)
    }
  }, [])

  if (loadFailed) {
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

  return (
    <section
      aria-label="SC Prints — interactive particle logo"
      className="relative flex min-h-[min(72vh,680px)] flex-col overflow-visible bg-black text-white [overflow:visible!important]"
    >
      <div
        ref={wrapRef}
        className="relative min-h-[min(72vh,680px)] w-full flex-1 overflow-visible [overflow:visible!important]"
        aria-hidden
      />
      {portalReady &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={stackRef}
            className="pointer-events-none [overflow:visible!important] [background:transparent!important] [width:100vw!important] [height:100vh!important] [min-width:100vw!important] [min-height:100vh!important]"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              minWidth: "100vw",
              minHeight: "100vh",
              pointerEvents: "none",
              zIndex: 9999,
              overflow: "visible",
              background: "transparent",
            }}
          >
            {/* Visible until canvas particle raster succeeds; avoids double logo vs stipple */}
            <img
              src={logoSrc}
              alt=""
              decoding="async"
              className={`pointer-events-none absolute left-1/2 top-1/2 z-[5] max-h-[min(58vh,560px)] max-w-[min(96%,80rem)] -translate-x-1/2 -translate-y-1/2 object-contain transition-opacity duration-300 ${
                logoRasterReady ? "opacity-0" : "opacity-100"
              }`}
              draggable={false}
              aria-hidden={logoRasterReady}
            />
            <canvas
              ref={canvasORef}
              aria-hidden
              className="pointer-events-none z-[10] block min-h-0 min-w-0 !bg-transparent [background:transparent!important] [image-rendering:auto]"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                pointerEvents: "none",
                overflow: "visible",
                background: "transparent",
              }}
            />
            <canvas
              ref={canvasARef}
              aria-hidden
              className="pointer-events-none z-[11] block min-h-0 min-w-0 !bg-transparent [background:transparent!important] [image-rendering:auto]"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                pointerEvents: "none",
                overflow: "visible",
                background: "transparent",
              }}
            />
            <canvas
              ref={canvasCRef}
              aria-hidden
              className="pointer-events-none z-[12] block min-h-0 min-w-0 !bg-transparent [background:transparent!important] [image-rendering:auto]"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                pointerEvents: "none",
                overflow: "visible",
                background: "transparent",
              }}
            />
          </div>,
          document.body
        )}
    </section>
  )
}
