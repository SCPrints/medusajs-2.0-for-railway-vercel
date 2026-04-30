"use client"

import { useEffect, useRef } from "react"

/** Teal brand-accent pointer trail (17 dots, speed-gated). Set false to disable sitewide. */
export const CURSOR_FOLLOW_TRAIL_ENABLED = false

/** Dots in the follow chain; more = longer trail but more work per frame. */
const PARTICLE_COUNT = 17
/**
 * How fast each point chases the one in front. Higher = tighter bundle (shorter
 * on-screen smear) with many particles; lower = a longer, lazier trail.
 */
const TRAIL_EASING = 0.32
/** Head-to-tail scale and alpha falloff (same visual end weight as the old 12-dot trail). */
const TAIL_SCALE_RANGE = 0.605
const TAIL_ALPHA_RANGE = 0.78

/** Min delta time when computing inst. speed (avoids coalesced-event spikes, ms) */
const MIN_DT_MS = 3
/** EMA blend for speed: higher = steadier, lower = snappier */
const SPEED_EMA = 0.78
/** When no new pointer event for this long, decay smoothed speed per frame (ms) */
const IDLE_FADE_START_MS = 32
const IDLE_SPEED_DECAY = 0.9
/** px/s at/below → trail invisible; at/above SPEED_HIGH_PX_S → full strength */
const SPEED_LOW_PX_S = 55
const SPEED_HIGH_PX_S = 300

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge1 <= edge0) {
    return x >= edge0 ? 1 : 0
  }
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const CursorDot = () => {
  const trailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!CURSOR_FOLLOW_TRAIL_ENABLED) {
      return
    }

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

    let lastClientX = 0
    let lastClientY = 0
    let lastMoveTime = 0
    let hasSampleForSpeed = false
    let smoothedSpeed = 0

    const updateTrail = () => {
      const now = performance.now()
      if (now - lastMoveTime > IDLE_FADE_START_MS) {
        smoothedSpeed *= IDLE_SPEED_DECAY
      }

      const speedOpacity = smoothstep(
        SPEED_LOW_PX_S,
        SPEED_HIGH_PX_S,
        smoothedSpeed
      )

      px[0] += (targetX - px[0]) * TRAIL_EASING
      py[0] += (targetY - py[0]) * TRAIL_EASING

      for (let i = 1; i < PARTICLE_COUNT; i++) {
        px[i] += (px[i - 1] - px[i]) * TRAIL_EASING
        py[i] += (py[i - 1] - py[i]) * TRAIL_EASING
      }

      const visibilityFactor = isVisible ? 1 : 0
      const maxI = PARTICLE_COUNT - 1
      const t = maxI > 0 ? 1 / maxI : 0
      for (let i = 0; i < particles.length; i++) {
        const el = particles[i]
        const along = i * t
        const scale = 1 - along * TAIL_SCALE_RANGE
        const baseAlpha = Math.max(0.22, 1 - along * TAIL_ALPHA_RANGE)
        const alpha = baseAlpha * speedOpacity * visibilityFactor
        el.style.transform = `translate3d(${px[i]}px, ${py[i]}px, 0) translate(-50%, -50%) scale(${scale})`
        el.style.opacity = String(alpha)
      }

      frameId = window.requestAnimationFrame(updateTrail)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        return
      }

      const now = performance.now()
      targetX = event.clientX
      targetY = event.clientY
      isVisible = true

      if (hasSampleForSpeed) {
        const dt = Math.max(now - lastMoveTime, MIN_DT_MS)
        const dx = event.clientX - lastClientX
        const dy = event.clientY - lastClientY
        const dist = Math.hypot(dx, dy)
        const instantPxPerSec = (dist / dt) * 1000
        smoothedSpeed =
          smoothedSpeed * SPEED_EMA + instantPxPerSec * (1 - SPEED_EMA)
      } else {
        hasSampleForSpeed = true
      }
      lastClientX = event.clientX
      lastClientY = event.clientY
      lastMoveTime = now
    }

    const hideTrail = () => {
      isVisible = false
      smoothedSpeed = 0
      hasSampleForSpeed = false
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        isVisible = false
        smoothedSpeed = 0
        hasSampleForSpeed = false
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

  if (!CURSOR_FOLLOW_TRAIL_ENABLED) {
    return null
  }

  return (
    <div aria-hidden className="cursor-follow-trail" ref={trailRef}>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <div key={i} className="cursor-follow-particle" />
      ))}
    </div>
  )
}

export default CursorDot
