"use client"

import { useEffect, useRef } from "react"

/**
 * Newmix-style flow renderer. Decoded from the live newmixcoffee.com JS bundle.
 *
 * Algorithm:
 *  - 3 stacked offscreen canvases of the SC Prints wordmark stipple, drawn ONCE at mount
 *    via `putImageData`. Pixel positions sampled from the logo's alpha mask.
 *  - 4th canvas with ~600 dynamic particles that oscillate around fixed origins inside
 *    the silhouette and apply a soft radial repel within ~120 px of the cursor.
 *  - Smoothed mouse-position drives CSS `translate3d` parallax on each layer at different
 *    multipliers (10×, 20×, 30×). The lag between mouse motion and layer position
 *    produces the visible "wake / trail" effect — it's parallax, not particle physics.
 *
 * Forces: zero. No capture, no carry, no wake state, no history buffer. Just smoothed
 * CSS transforms and a gentle local repel on a small overlay layer.
 */

const LOGO_SRC = "/branding/sc-prints-logo-transparent.png"

/** Static stipple layer: ~200k pixels via putImageData, alpha 10-60. */
const STATIC_SMALL_COUNT = 200000
/** Static stipple layer: ~110k pixels via putImageData, alpha 15-90. */
const STATIC_MEDIUM_COUNT = 110000
/** Static layer: ~8k larger arc-fill particles for visible coffee-grain texture. */
const STATIC_ARC_COUNT = 8000
/** Dynamic interactive particles, redrawn every frame. */
const DYNAMIC_COUNT = 600
/** Cursor repel radius (bitmap px). */
const REPEL_RADIUS = 120
/** Peak repel impulse at cursor center. */
const REPEL_STRENGTH = 60
/** Smoothing factor for mouse-position lerp (per frame). 0.06 = ~16-frame catch-up. */
const PARALLAX_SMOOTH = 0.06
const PARALLAX_MULT_SMALL = 10
const PARALLAX_MULT_DYNAMIC = 20
const PARALLAX_MULT_MEDIUM = 30
/** Fraction of stipple pixels that fall on the logo silhouette vs. the whole canvas.
 * The remaining fraction creates the ambient background stipple that flows in the wake. */
const SILHOUETTE_FRACTION = 0.7

/** Box-Muller standard normal random ∈ ℝ. */
function gauss(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export default function NewmixFlow() {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let cleanup: (() => void) | null = null
    let cancelled = false

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    const cssW = wrap.offsetWidth || window.innerWidth
    const cssH = wrap.offsetHeight || window.innerHeight
    const W = Math.max(1, Math.round(cssW * dpr))
    const H = Math.max(1, Math.round(cssH * dpr))

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = LOGO_SRC
    img.onload = () => {
      if (cancelled) return

      /** Rasterize the logo to extract candidate pixel positions for the stipple. */
      const off = document.createElement("canvas")
      off.width = W
      off.height = H
      const octx = off.getContext("2d")
      if (!octx) return

      const pad = 0.85
      const scale = Math.min(
        (W * pad) / img.naturalWidth,
        (H * pad) / img.naturalHeight
      )
      const dw = img.naturalWidth * scale
      const dh = img.naturalHeight * scale
      const dx = (W - dw) / 2
      const dy = (H - dh) / 2
      octx.clearRect(0, 0, W, H)
      octx.drawImage(img, dx, dy, dw, dh)

      let imgData: ImageData
      try {
        imgData = octx.getImageData(0, 0, W, H)
      } catch {
        return
      }
      const data = imgData.data

      /** Alpha-mask candidates: pixel coordinates where the logo is opaque. */
      const candidates: Array<{ x: number; y: number }> = []
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const a = data[(y * W + x) * 4 + 3]!
          if (a > 200) {
            candidates.push({ x, y })
          }
        }
      }
      if (candidates.length === 0) return
      const nC = candidates.length

      /** Build a stipple canvas. `silhouetteFrac` of pixels are placed inside the
       * logo silhouette (with small jitter); the remainder are uniformly distributed
       * across the whole canvas to provide the ambient background stipple. */
      const buildStaticLayer = (
        count: number,
        alphaMin: number,
        alphaMax: number
      ): HTMLCanvasElement => {
        const c = document.createElement("canvas")
        c.width = W
        c.height = H
        const ctx = c.getContext("2d")
        if (!ctx) return c
        const id = ctx.createImageData(W, H)
        const out = id.data
        for (let i = 0; i < count; i++) {
          let px: number
          let py: number
          if (Math.random() < SILHOUETTE_FRACTION) {
            const cand = candidates[Math.floor(Math.random() * nC)]!
            px = Math.round(cand.x + gauss() * 1.5)
            py = Math.round(cand.y + gauss() * 1.5)
          } else {
            px = Math.floor(Math.random() * W)
            py = Math.floor(Math.random() * H)
          }
          if (px < 0 || px >= W || py < 0 || py >= H) continue
          const idx = (py * W + px) * 4
          const alpha =
            alphaMin + Math.floor(Math.random() * (alphaMax - alphaMin))
          out[idx] = 255
          out[idx + 1] = 255
          out[idx + 2] = 255
          out[idx + 3] = Math.min(255, out[idx + 3]! + alpha)
        }
        ctx.putImageData(id, 0, 0)
        return c
      }

      const layerSmall = buildStaticLayer(STATIC_SMALL_COUNT, 10, 60)
      const layerMedium = buildStaticLayer(STATIC_MEDIUM_COUNT, 15, 90)

      /** Add ~8k larger arc-fill particles to the medium layer for grain texture. */
      const lmctx = layerMedium.getContext("2d")
      if (lmctx) {
        for (let i = 0; i < STATIC_ARC_COUNT; i++) {
          let pxa: number
          let pya: number
          if (Math.random() < SILHOUETTE_FRACTION) {
            const cand = candidates[Math.floor(Math.random() * nC)]!
            pxa = cand.x + gauss() * 2
            pya = cand.y + gauss() * 2
          } else {
            pxa = Math.random() * W
            pya = Math.random() * H
          }
          const r = 0.5 + 0.7 * Math.random()
          const a = 0.03 + 0.15 * Math.random()
          lmctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
          lmctx.beginPath()
          lmctx.arc(pxa, pya, r, 0, Math.PI * 2)
          lmctx.fill()
        }
      }

      /** Dynamic layer — cleared and redrawn every frame. */
      const layerDynamic = document.createElement("canvas")
      layerDynamic.width = W
      layerDynamic.height = H
      const ldctx = layerDynamic.getContext("2d")
      if (!ldctx) return

      /** Build the 600 dynamic particles with origins inside the silhouette. */
      type Particle = {
        ox: number
        oy: number
        r: number
        fill: string
        phase: number
        speed: number
        repelX: number
        repelY: number
      }
      const particles: Particle[] = []
      for (let i = 0; i < DYNAMIC_COUNT; i++) {
        const cand = candidates[Math.floor(Math.random() * nC)]!
        const ox = cand.x + gauss() * 2
        const oy = cand.y + gauss() * 2
        const r = 0.5 + Math.random()
        const a = 0.06 + 0.22 * Math.random()
        particles.push({
          ox,
          oy,
          r,
          fill: `rgba(255,255,255,${a.toFixed(3)})`,
          phase: Math.random() * Math.PI * 2,
          speed: 0.012 * (0.5 + Math.random()),
          repelX: 0,
          repelY: 0,
        })
      }

      /** Mount the canvases as DOM children with absolute positioning. */
      const mountCanvas = (c: HTMLCanvasElement) => {
        c.style.position = "absolute"
        c.style.top = "0"
        c.style.left = "0"
        c.style.width = "100%"
        c.style.height = "100%"
        c.style.pointerEvents = "none"
        c.style.willChange = "transform"
        wrap.appendChild(c)
      }
      mountCanvas(layerSmall)
      mountCanvas(layerMedium)
      mountCanvas(layerDynamic)

      /** Mouse state. `Lx`/`Ly` are normalized ∈ [-1, 1] from canvas center, used for
       * the parallax targets. `Tx`/`Ty` are the smoothed values that the layers track. */
      let Lx = 0
      let Ly = 0
      let Tx = 0
      let Ty = 0
      /** Bitmap-space cursor for the dynamic-layer repel. */
      let mRawX = -9999
      let mRawY = -9999

      const onMouseMove = (e: MouseEvent) => {
        const rect = wrap.getBoundingClientRect()
        const halfW = Math.max(1, rect.width / 2)
        const halfH = Math.max(1, rect.height / 2)
        Lx = (e.clientX - rect.left - halfW) / halfW
        Ly = (e.clientY - rect.top - halfH) / halfH
        mRawX = ((e.clientX - rect.left) / rect.width) * W
        mRawY = ((e.clientY - rect.top) / rect.height) * H
      }
      const onMouseLeave = () => {
        Lx = 0
        Ly = 0
        mRawX = -9999
        mRawY = -9999
      }
      window.addEventListener("mousemove", onMouseMove)
      wrap.addEventListener("mouseleave", onMouseLeave)

      let raf = 0
      let running = true
      const startMs = performance.now()

      const tick = (now: number) => {
        if (!running) return

        /** Smooth parallax targets. */
        Tx += (Lx - Tx) * PARALLAX_SMOOTH
        Ty += (Ly - Ty) * PARALLAX_SMOOTH

        /** Ambient drift — slow sine waves so layers gently breathe even without input. */
        const t = (now - startMs) * 0.001
        const easeIn = Math.min(1, (now - startMs) / 2000)
        const ix = 8 * Math.sin(0.2 * t) * easeIn
        const iy = 6 * Math.cos(0.15 * t) * easeIn
        const px = 14 * Math.sin(0.28 * t + 1) * easeIn
        const py = 10 * Math.cos(0.22 * t + 1) * easeIn

        /** Apply per-layer parallax transforms via CSS — this is what produces the wake. */
        layerSmall.style.transform = `translate3d(${(
          PARALLAX_MULT_SMALL * Tx +
          ix
        ).toFixed(1)}px, ${(PARALLAX_MULT_SMALL * Ty + iy).toFixed(
          1
        )}px, 0)`
        layerMedium.style.transform = `translate3d(${(
          PARALLAX_MULT_MEDIUM * Tx +
          px
        ).toFixed(1)}px, ${(PARALLAX_MULT_MEDIUM * Ty + py).toFixed(
          1
        )}px, 0)`
        layerDynamic.style.transform = `translate3d(${(
          PARALLAX_MULT_DYNAMIC * Tx
        ).toFixed(1)}px, ${(PARALLAX_MULT_DYNAMIC * Ty).toFixed(1)}px, 0)`

        /** Redraw dynamic particles with oscillation + radial repel near cursor. */
        ldctx.clearRect(0, 0, W, H)
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i]!
          const oscX = 8 * Math.sin(t * p.speed + p.phase)
          const oscY = 8 * Math.cos(t * p.speed * 0.7 + p.phase) * 0.7
          const sx = p.ox + oscX
          const sy = p.oy + oscY
          const dxm = sx - mRawX
          const dym = sy - mRawY
          const dist = Math.sqrt(dxm * dxm + dym * dym)
          if (dist < REPEL_RADIUS && dist > 0.1) {
            const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH
            const targetX = (dxm / dist) * force
            const targetY = (dym / dist) * force
            p.repelX += (targetX - p.repelX) * 0.15
            p.repelY += (targetY - p.repelY) * 0.15
          } else {
            p.repelX *= 0.92
            p.repelY *= 0.92
          }
          ldctx.fillStyle = p.fill
          ldctx.beginPath()
          ldctx.arc(sx + p.repelX, sy + p.repelY, p.r, 0, Math.PI * 2)
          ldctx.fill()
        }

        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      cleanup = () => {
        running = false
        if (raf !== 0) cancelAnimationFrame(raf)
        window.removeEventListener("mousemove", onMouseMove)
        wrap.removeEventListener("mouseleave", onMouseLeave)
        if (layerSmall.parentNode) layerSmall.parentNode.removeChild(layerSmall)
        if (layerMedium.parentNode)
          layerMedium.parentNode.removeChild(layerMedium)
        if (layerDynamic.parentNode)
          layerDynamic.parentNode.removeChild(layerDynamic)
      }
    }

    img.onerror = () => {
      // Logo failed to load — render nothing.
    }

    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ height: "min(85vh, 700px)" }}
    />
  )
}
