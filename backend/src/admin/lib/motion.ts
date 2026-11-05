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
 * FLIP for a list: children marked `data-flip="<stable id>"` glide from where
 * they were to where they are now; new ones settle in. Changing `scope` (another
 * folder, a search, another job) swaps the list without animating it.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, scope: string) {
  const last = useRef<{ scope: string; tops: Map<string, number> } | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const tops = new Map<string, number>()
    const prev = last.current?.scope === scope ? last.current.tops : null
    root.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      // offsetTop, not getBoundingClientRect: scrolling must not count as moving.
      const top = el.offsetTop
      tops.set(el.dataset.flip!, top)
      if (!prev || reduceMotion()) return
      const was = prev.get(el.dataset.flip!)
      if (was === undefined) settle(el)
      else if (Math.abs(was - top) > 1) {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: GLIDE_MS, easing: EASE })
      }
    })
    last.current = { scope, tops }
  })
}
