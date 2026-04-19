"use client"

import { useEffect, useRef } from "react"

const TRAIL_EASING = 0.18

const CursorDot = () => {
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dot = dotRef.current

    if (!dot) {
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

    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let currentX = targetX
    let currentY = targetY
    let isVisible = false

    const updateDot = () => {
      currentX += (targetX - currentX) * TRAIL_EASING
      currentY += (targetY - currentY) * TRAIL_EASING

      dot.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`
      dot.style.opacity = isVisible ? "1" : "0"

      frameId = window.requestAnimationFrame(updateDot)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        return
      }

      targetX = event.clientX
      targetY = event.clientY
      isVisible = true
    }

    const hideDot = () => {
      isVisible = false
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        isVisible = false
      }
    }

    let frameId = window.requestAnimationFrame(updateDot)

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("blur", hideDot)
    document.addEventListener("mouseleave", hideDot)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("blur", hideDot)
      document.removeEventListener("mouseleave", hideDot)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return <div aria-hidden className="cursor-follow-dot" ref={dotRef} />
}

export default CursorDot
