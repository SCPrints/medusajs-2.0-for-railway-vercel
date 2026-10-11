"use client"

import { useEffect, useRef } from "react"

import {
  buildStarfield,
  paintStarsFrame,
  setupStarsCanvasSize,
  type StarLayer,
  type Twinkler,
} from "@modules/home/components/space-hero/starfield"

/**
 * The home hero's parallax starfield + nebula, painted on its own canvas
 * behind the catalog graph. Pre-rendered star layers mean a frame is ~3
 * drawImage + ~40 fillRect, so it stays cheap next to the graph canvas.
 * Honours prefers-reduced-motion by painting a single static frame.
 */
export function StarfieldBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    let layers: StarLayer[] = []
    let twinklers: Twinkler[] = []
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    const start = performance.now()

    const reducedMotion = (() => {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      } catch {
        return false
      }
    })()

    const rebuild = () => {
      w = parent.clientWidth || window.innerWidth
      h = parent.clientHeight || window.innerHeight
      dpr = Math.min(2, window.devicePixelRatio || 1)
      setupStarsCanvasSize(canvas, w, h, dpr)
      const built = buildStarfield(w, h, dpr)
      layers = built.layers
      twinklers = built.twinklers
      paintStarsFrame(canvas, w, h, dpr, layers, twinklers, 0)
    }

    const tick = () => {
      if (!document.hidden) {
        paintStarsFrame(canvas, w, h, dpr, layers, twinklers, performance.now() - start)
      }
      raf = window.requestAnimationFrame(tick)
    }

    rebuild()
    const observer = new ResizeObserver(rebuild)
    observer.observe(parent)
    if (!reducedMotion) raf = window.requestAnimationFrame(tick)

    return () => {
      observer.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden className={className} />
}
