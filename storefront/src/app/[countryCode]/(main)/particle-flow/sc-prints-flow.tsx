"use client"

import { useEffect, useRef } from "react"

import type { ScPrintsFlowTuning } from "./sc-prints-flow-tuning"
import { mergeScPrintsFlowTuning } from "./sc-prints-flow-tuning"

const LOGO_SRC = "/branding/sc-prints-logo-transparent.png"

const STATE_SETTLED = 0
const STATE_PARKED = 1
const STATE_DRIFTING = 2

type Props = {
  tuning?: Partial<ScPrintsFlowTuning> | null
  className?: string
}

export default function ScPrintsFlow({ tuning, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tuningRef = useRef<ScPrintsFlowTuning>(mergeScPrintsFlowTuning(tuning))
  tuningRef.current = mergeScPrintsFlowTuning(tuning)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let cancelled = false
    let raf = 0
    let particles: {
      hx: Float32Array
      hy: Float32Array
      x: Float32Array
      y: Float32Array
      vx: Float32Array
      vy: Float32Array
      state: Uint8Array
      parkX: Float32Array
      parkY: Float32Array
      displacedAt: Float32Array
      holdJitter: Float32Array
      count: number
    } | null = null

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)

    const mouse = {
      x: -1e6,
      y: -1e6,
      px: -1e6,
      py: -1e6,
      vx: 0,
      vy: 0,
      inside: false,
    }

    const sizeState = { W: 0, H: 0, cssW: 0, cssH: 0 }

    const resize = () => {
      const cssW = wrap.offsetWidth || window.innerWidth
      const cssH = wrap.offsetHeight || 600
      const W = Math.max(1, Math.round(cssW * dpr))
      const H = Math.max(1, Math.round(cssH * dpr))
      if (W === sizeState.W && H === sizeState.H) return
      sizeState.W = W
      sizeState.H = H
      sizeState.cssW = cssW
      sizeState.cssH = cssH
      canvas.width = W
      canvas.height = H
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
      sampleParticles()
    }

    const sampleParticles = () => {
      const W = sizeState.W
      const H = sizeState.H
      if (W < 2 || H < 2) return
      const t = tuningRef.current

      const off = document.createElement("canvas")
      off.width = W
      off.height = H
      const octx = off.getContext("2d", { willReadFrequently: true })
      if (!octx) return
      octx.fillStyle = "#000"
      octx.fillRect(0, 0, W, H)

      const img = imgRef.current
      if (!img || !img.complete || img.naturalWidth === 0) return

      const padFrac = 0.08
      const availW = W * (1 - padFrac * 2)
      const availH = H * (1 - padFrac * 2)
      const scale = Math.min(availW / img.naturalWidth, availH / img.naturalHeight)
      const drawW = img.naturalWidth * scale
      const drawH = img.naturalHeight * scale
      const drawX = (W - drawW) / 2
      const drawY = (H - drawH) / 2
      octx.drawImage(img, drawX, drawY, drawW, drawH)

      const data = octx.getImageData(0, 0, W, H).data

      const stride = Math.max(1, Math.round(t.particleStride))
      const positions: number[] = []
      for (let y = 0; y < H; y += stride) {
        for (let x = 0; x < W; x += stride) {
          const idx = (y * W + x) * 4
          const a = data[idx + 3]!
          if (a > 40) {
            positions.push(x, y)
          }
        }
      }

      const count = positions.length / 2
      const hx = new Float32Array(count)
      const hy = new Float32Array(count)
      const x = new Float32Array(count)
      const y = new Float32Array(count)
      const vx = new Float32Array(count)
      const vy = new Float32Array(count)
      const state = new Uint8Array(count)
      const parkX = new Float32Array(count)
      const parkY = new Float32Array(count)
      const displacedAt = new Float32Array(count)
      const holdJitter = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        const px = positions[i * 2]!
        const py = positions[i * 2 + 1]!
        hx[i] = px
        hy[i] = py
        x[i] = px
        y[i] = py
        holdJitter[i] = Math.random()
      }
      particles = {
        hx,
        hy,
        x,
        y,
        vx,
        vy,
        state,
        parkX,
        parkY,
        displacedAt,
        holdJitter,
        count,
      }
    }

    const imgRef = { current: null as HTMLImageElement | null }
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = LOGO_SRC
    img.onload = () => {
      if (cancelled) return
      imgRef.current = img
      resize()
    }
    img.onerror = () => {
      console.error("[ScPrintsFlow] failed to load", LOGO_SRC)
    }

    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)

    const updateMouseFromClient = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const cssX = clientX - rect.left
      const cssY = clientY - rect.top
      mouse.x = cssX * dpr
      mouse.y = cssY * dpr
      mouse.inside =
        cssX >= 0 && cssX <= rect.width && cssY >= 0 && cssY <= rect.height
    }

    const onPointerMove = (e: PointerEvent) => {
      updateMouseFromClient(e.clientX, e.clientY)
    }
    const onPointerLeave = () => {
      mouse.inside = false
      mouse.x = -1e6
      mouse.y = -1e6
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    canvas.addEventListener("pointerleave", onPointerLeave)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const W = sizeState.W
      const H = sizeState.H
      if (!particles || W < 2 || H < 2) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, W || 1, H || 1)
        return
      }
      const t = tuningRef.current
      const now = performance.now()

      const rawDx = mouse.x - mouse.px
      const rawDy = mouse.y - mouse.py
      const sm = t.velSmoothing
      mouse.vx += (rawDx - mouse.vx) * sm
      mouse.vy += (rawDy - mouse.vy) * sm
      mouse.px = mouse.x
      mouse.py = mouse.y

      const speed = Math.hypot(mouse.vx, mouse.vy)
      const moving = mouse.inside && speed > t.motionThreshold
      const ux = moving ? mouse.vx / speed : 0
      const uy = moving ? mouse.vy / speed : 0
      const perpX = -uy
      const perpY = ux

      const R = t.radius * dpr
      const R2 = R * R
      const spread = t.spread * dpr

      const hx = particles.hx
      const hy = particles.hy
      const xs = particles.x
      const ys = particles.y
      const vxs = particles.vx
      const vys = particles.vy
      const states = particles.state
      const parkX = particles.parkX
      const parkY = particles.parkY
      const displacedAt = particles.displacedAt
      const holdJitter = particles.holdJitter
      const count = particles.count

      const mx = mouse.x
      const my = mouse.y

      for (let i = 0; i < count; i++) {
        const dx = xs[i]! - mx
        const dy = ys[i]! - my
        const d2 = dx * dx + dy * dy
        const inRadius = mouse.inside && d2 < R2

        if (inRadius && moving) {
          const sideDot = dx * perpX + dy * perpY
          const sideSign = sideDot >= 0 ? 1 : -1
          const along = dx * ux + dy * uy
          const offset = R + spread
          const newX = mx + ux * along + perpX * sideSign * offset
          const newY = my + uy * along + perpY * sideSign * offset
          xs[i] = newX
          ys[i] = newY
          vxs[i] = 0
          vys[i] = 0
          parkX[i] = newX
          parkY[i] = newY
          displacedAt[i] = now
          states[i] = STATE_PARKED
          continue
        }

        let s = states[i]!
        if (s === STATE_PARKED) {
          const elapsed = now - displacedAt[i]!
          const hold = t.holdMs + holdJitter[i]! * t.holdJitterMs
          if (elapsed >= hold) {
            states[i] = STATE_DRIFTING
            s = STATE_DRIFTING
          } else {
            xs[i] = parkX[i]!
            ys[i] = parkY[i]!
            vxs[i] = 0
            vys[i] = 0
            continue
          }
        }
        if (s === STATE_DRIFTING) {
          const dxh = hx[i]! - xs[i]!
          const dyh = hy[i]! - ys[i]!
          let nvx = vxs[i]! + dxh * t.returnSpring
          let nvy = vys[i]! + dyh * t.returnSpring + t.returnGravity
          nvx *= t.returnFriction
          nvy *= t.returnFriction
          vxs[i] = nvx
          vys[i] = nvy
          xs[i] = xs[i]! + nvx
          ys[i] = ys[i]! + nvy
          if (
            dxh * dxh + dyh * dyh < 0.5 &&
            nvx * nvx + nvy * nvy < 0.05
          ) {
            xs[i] = hx[i]!
            ys[i] = hy[i]!
            vxs[i] = 0
            vys[i] = 0
            states[i] = STATE_SETTLED
          }
        }
      }

      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#ffffff"
      const size = Math.max(1, Math.round(t.particleSize * dpr))
      const half = size / 2
      for (let i = 0; i < count; i++) {
        ctx.fillRect(xs[i]! - half, ys[i]! - half, size, size)
      }
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      className={
        className ??
        "relative h-[min(100vh,720px)] w-full overflow-hidden bg-black"
      }
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  )
}
