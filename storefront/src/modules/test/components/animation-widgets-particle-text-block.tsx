"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

type Particle = {
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
}

type Props = {
  reducedMotion: boolean
}

const LINES = ["start", "with", "mix"]
const REPEL_R = 110
const REPEL_STRENGTH = 2.8
const SPRING = 0.09
const DAMPING = 0.86
const MAX_P = 9000
const STRIDE = 2
const JITTER = 1.4

export default function AnimationWidgetsParticleTextBlock({ reducedMotion }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })
  const dprRef = useRef(1)

  const drawStatic = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#fff"
    for (const p of particlesRef.current) {
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
    }
  }, [])

  const build = useCallback(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) {
      return
    }
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    dprRef.current = dpr

    const wRaw = Math.floor(wrap.clientWidth)
    const wFromRect = Math.floor(wrap.getBoundingClientRect().width)
    const w = Math.max(120, wRaw >= 64 ? wRaw : wFromRect >= 64 ? wFromRect : 400)
    const h = Math.floor(Math.min(360, Math.max(260, window.innerHeight * 0.35)))
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const off = document.createElement("canvas")
    off.width = canvas.width
    off.height = canvas.height
    const octx = off.getContext("2d")
    if (!octx) {
      return
    }

    octx.scale(dpr, dpr)
    octx.fillStyle = "#000"
    octx.fillRect(0, 0, w, h)
    octx.fillStyle = "#fff"
    octx.textAlign = "center"
    octx.textBaseline = "middle"

    const size = Math.min(w / 7, 72)
    octx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
    const lineH = size * 1.12
    const startY = h / 2 - ((LINES.length - 1) * lineH) / 2

    LINES.forEach((line, i) => {
      octx.fillText(line, w / 2, startY + i * lineH)
    })

    const img = octx.getImageData(0, 0, canvas.width, canvas.height)
    const data = img.data
    const pts: Particle[] = []
    for (let y = 0; y < canvas.height && pts.length < MAX_P; y += STRIDE) {
      for (let x = 0; x < canvas.width && pts.length < MAX_P; x += STRIDE) {
        const a = data[(y * canvas.width + x) * 4 + 3]
        if (a > 140) {
          const hx = x
          const hy = y
          const jx = (Math.random() - 0.5) * JITTER * dpr
          const jy = (Math.random() - 0.5) * JITTER * dpr
          pts.push({
            hx,
            hy,
            x: hx + jx,
            y: hy + jy,
            vx: 0,
            vy: 0,
          })
        }
      }
    }
    particlesRef.current = pts

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      return
    }
    drawStatic(ctx, canvas)
  }, [drawStatic, reducedMotion])

  useLayoutEffect(() => {
    build()
  }, [build, reducedMotion])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) {
      return undefined
    }
    const ro = new ResizeObserver(() => build())
    ro.observe(el)
    return () => ro.disconnect()
  }, [build, reducedMotion])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return undefined
    }

    const step = () => {
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        return
      }

      const pts = particlesRef.current
      const { x: mx, y: my, active } = mouseRef.current
      const dpr = dprRef.current
      const mxx = mx * dpr
      const myy = my * dpr
      const r2 = (REPEL_R * dpr) ** 2

      for (const p of pts) {
        if (active) {
          const dx = p.x - mxx
          const dy = p.y - myy
          const dist2 = dx * dx + dy * dy
          if (dist2 < r2 && dist2 > 0.01) {
            const dist = Math.sqrt(dist2)
            const t = 1 - dist / (REPEL_R * dpr)
            const f = REPEL_STRENGTH * t * t
            p.vx += (dx / dist) * f
            p.vy += (dy / dist) * f
          }
        }

        p.vx += (p.hx - p.x) * SPRING
        p.vy += (p.hy - p.y) * SPRING
        p.vx *= DAMPING
        p.vy *= DAMPING
        p.x += p.vx
        p.y += p.vy
      }

      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "#fff"
      for (const p of pts) {
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [reducedMotion, build])

  return (
    <div
      ref={wrapRef}
      className="relative min-h-[280px] w-full rounded-xl border border-ui-border-base bg-black"
      onPointerMove={(e) => {
        const c = canvasRef.current
        if (!c) {
          return
        }
        const r = c.getBoundingClientRect()
        mouseRef.current = {
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          active: true,
        }
      }}
      onPointerLeave={() => {
        mouseRef.current.active = false
      }}
    >
      <canvas ref={canvasRef} className="mx-auto block w-full touch-none" />
      {!reducedMotion ? (
        <p className="pointer-events-none absolute bottom-2 left-2 right-2 text-center text-[10px] text-white/50">
          Move the pointer over the letters — particles repel and spring back (newmix-style grain).
        </p>
      ) : (
        <p className="pointer-events-none absolute bottom-2 left-2 right-2 text-center text-[10px] text-white/50">
          Reduced motion: static stipple.
        </p>
      )}
    </div>
  )
}
