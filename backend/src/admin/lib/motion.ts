import { useLayoutEffect, useRef, type RefObject } from "react"

/**
 * Admin motion (Docs/admin-ux-review): transform + opacity only, never blocks
 * a click, and off when the OS asks for reduced motion.
 */
export const EASE = "cubic-bezier(.2,.8,.2,1)"
export const GLIDE_MS = 350

export const reduceMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** A new item fading down into place. */
export function settle(el: Element) {
  if (reduceMotion()) return
  el.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 200, easing: EASE })
}

/** A number that just changed, pulsing once. */
export function tick(el: Element) {
  if (reduceMotion()) return
  el.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 240, easing: EASE })
}

/**
 * FLIP for a list or board: children marked `data-flip="<stable id>"` glide
 * from where they were to where they are now (a card changing column lifts a
 * little on the way); new ones settle in. Changing `scope` (another folder, a
 * search, another job) swaps the content without animating it.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, scope: string) {
  const last = useRef<{ scope: string; at: Map<string, [number, number]> } | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const at = new Map<string, [number, number]>()
    const prev = last.current?.scope === scope ? last.current.at : null
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      // offsetLeft/Top, not getBoundingClientRect: scrolling must not count as moving.
      const x = el.offsetLeft
      const y = el.offsetTop
      at.set(el.dataset.flip!, [x, y])
      if (!prev || reduceMotion()) return
      const was = prev.get(el.dataset.flip!)
      if (!was) return settle(el)
      const dx = was[0] - x
      const dy = was[1] - y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      const far = Math.abs(dx) > 40
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)${far ? " rotate(-2deg) scale(1.03)" : ""}`, boxShadow: far ? "0 12px 28px rgba(0,0,0,.18)" : "none" },
          { transform: "none", boxShadow: "none" },
        ],
        { duration: far ? GLIDE_MS : 240, easing: EASE }
      )
    })
    last.current = { scope, at }
  })
}
