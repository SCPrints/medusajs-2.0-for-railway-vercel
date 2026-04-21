"use client"

import { useEffect, useRef } from "react"

const PARTICLE_COUNT = 12
const TRAIL_EASING = 0.2

const CursorDot = () => {
  const trailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trail = trailRef.current

    if (!trail) {
      return
    }

    const particles = Array.from(
      trail.querySelectorAll<HTMLDivElement>(".cursor-follow-particle")
    )

    if (particles.length === 0) {
      return
    }

    const canHover = window.matchMedia("(hover: hover)").matches
    const hasFinePointer = window.matchMedia("(pointer: fine)").matches
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (!canHover || !hasFinePointer || prefersReducedMotion) {
      return
    }

    const midX = window.innerWidth / 2
    const midY = window.innerHeight / 2
    const px = new Float32Array(PARTICLE_COUNT)
    const py = new Float32Array(PARTICLE_COUNT)
    px.fill(midX)
    py.fill(midY)

    let targetX = midX
    let targetY = midY
    let isVisible = false

    const updateTrail = () => {
      px[0] += (targetX - px[0]) * TRAIL_EASING
      py[0] += (targetY - py[0]) * TRAIL_EASING

      for (let i = 1; i < PARTICLE_COUNT; i++) {
        px[i] += (px[i - 1] - px[i]) * TRAIL_EASING
        py[i] += (py[i - 1] - py[i]) * TRAIL_EASING
      }

      for (let i = 0; i < particles.length; i++) {
        const el = particles[i]
        const scale = 1 - i * 0.055
        const alpha = isVisible ? Math.max(0.22, 1 - i * 0.07) : 0
        el.style.transform = `translate3d(${px[i]}px, ${py[i]}px, 0) translate(-50%, -50%) scale(${scale})`
        el.style.opacity = String(alpha)
      }

      frameId = window.requestAnimationFrame(updateTrail)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        return
      }

      targetX = event.clientX
      targetY = event.clientY
      isVisible = true
    }

    const hideTrail = () => {
      isVisible = false
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        isVisible = false
      }
    }

    let frameId = window.requestAnimationFrame(updateTrail)

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("blur", hideTrail)
    document.addEventListener("mouseleave", hideTrail)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("blur", hideTrail)
      document.removeEventListener("mouseleave", hideTrail)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return (
    <div aria-hidden className="cursor-follow-trail" ref={trailRef}>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <div key={i} className="cursor-follow-particle" />
      ))}
    </div>
  )
}

export default CursorDot
