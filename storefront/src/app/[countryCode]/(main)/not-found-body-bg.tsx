"use client"

import { useEffect } from "react"

/**
 * Forces the page body + html bg to the header colour (`--header-bg`,
 * Inkwell Navy by default) while the 404 page is mounted. Bypasses CSS
 * cascade entirely by setting inline styles with `!important` directly on
 * `document.body` / `document.documentElement`.
 * Restores the previous styles on unmount.
 */
export default function NotFoundBodyBg() {
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const htmlPrev = html.style.cssText
    const bodyPrev = body.style.cssText
    html.style.setProperty("background-color", "rgb(var(--header-bg))", "important")
    body.style.setProperty("background-color", "rgb(var(--header-bg))", "important")
    return () => {
      html.style.cssText = htmlPrev
      body.style.cssText = bodyPrev
    }
  }, [])
  return null
}
