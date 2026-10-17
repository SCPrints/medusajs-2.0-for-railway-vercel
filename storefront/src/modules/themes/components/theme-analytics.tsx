"use client"

import { useEffect } from "react"

import { phCaptureWhenReady } from "@lib/posthog"
import { THEME_APPLIED_SESSION_KEY } from "@lib/themes/config"

/** Fires `theme_applied` once per browser session. Renders nothing. */
export default function ThemeAnalytics() {
  useEffect(() => {
    const info = window.__scpTheme
    if (!info) return
    try {
      if (window.sessionStorage.getItem(THEME_APPLIED_SESSION_KEY)) return
      window.sessionStorage.setItem(THEME_APPLIED_SESSION_KEY, "1")
    } catch {
      // no sessionStorage: capture anyway (at most once per page load)
    }
    phCaptureWhenReady("theme_applied", { theme: info.theme, source: info.source })
  }, [])
  return null
}
