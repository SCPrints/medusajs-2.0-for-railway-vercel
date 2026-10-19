"use client"

import { useSyncExternalStore } from "react"

const onVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb)
  return () => document.removeEventListener("visibilitychange", cb)
}

/** True while the tab is hidden — decorations pause their animations. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    onVisibility,
    () => document.visibilityState === "hidden",
    () => false
  )
}

const REDUCED = "(prefers-reduced-motion: reduce)"

const onReducedChange = (cb: () => void) => {
  const mql = window.matchMedia(REDUCED)
  mql.addEventListener("change", cb)
  return () => mql.removeEventListener("change", cb)
}

/** prefers-reduced-motion: reduce. True on the server (the safe side). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    onReducedChange,
    () => window.matchMedia(REDUCED).matches,
    () => true
  )
}
