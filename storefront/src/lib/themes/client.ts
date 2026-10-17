"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { phCapture } from "@lib/posthog"
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY } from "./config"
import type { ThemeInitResult } from "./init-script"

declare global {
  interface Window {
    __scpTheme?: ThemeInitResult
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange)
}

const getSnapshot = () =>
  document.documentElement.getAttribute("data-theme") || "classic"

/**
 * The theme currently on <html>. Renders "classic" on the server and during
 * hydration (matching the static HTML), then the real value — so components
 * that branch on it never cause a hydration mismatch.
 */
export function useActiveTheme(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "classic")
}

const noopSubscribe = () => () => {}

/** What the inline head script decided; null on the server and during hydration. */
export function useThemeInit(): ThemeInitResult | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.__scpTheme ?? null,
    () => null
  )
}

/** Switch theme after load (footer toggle) and remember it for this season. */
export function setTheme(next: string) {
  const root = document.documentElement
  const from = root.getAttribute("data-theme") || "classic"
  if (from === next) return
  root.setAttribute("data-theme", next)
  const season = window.__scpTheme?.season ?? "classic"
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, `${next}|${season}`)
  } catch {
    // blocked storage: the switch still applies until the next full load
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  phCapture("theme_toggled", { from, to: next })
}

/** True once the browser is idle — keeps decoration chunks off the LCP path. */
export function useIdle(timeout = 2000): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined
    if (ric) {
      const id = ric(() => setIdle(true), { timeout })
      return () => (window as any).cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(() => setIdle(true), 1200)
    return () => window.clearTimeout(id)
  }, [timeout])
  return idle
}
