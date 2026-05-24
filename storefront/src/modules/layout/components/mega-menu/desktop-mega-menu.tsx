"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { MenuAudience } from "@lib/data/shop-categories-menu"

import AudienceDropdown from "./audience-dropdown"

/**
 * Desktop mega-menu — horizontal row of audience triggers with
 * hover-driven dropdown panels.
 *
 * UX model (Colour-Cartel-style):
 *   - Hover an audience link → its dropdown opens instantly. Hovering
 *     a sibling switches the dropdown without closing first.
 *   - Mouse leaves both the trigger row AND the open panel → close after
 *     a 150ms grace window (avoids flicker when moving cursor between
 *     trigger and panel).
 *   - Clicking the audience link navigates to /categories/<handle>
 *     (the audience landing page). The dropdown doesn't intercept clicks
 *     — touch users tap-to-navigate as expected, mouse users get the
 *     dropdown for browsing.
 *   - Escape closes the open dropdown.
 *   - Pathname change (real navigation) closes any open dropdown.
 *
 * Visible only at `small:` (1024px+) breakpoint and up — mobile menu is
 * a separate component because its accordion presentation doesn't share
 * any layout with the desktop dropdown.
 */

const CLOSE_DELAY_MS = 150

type Props = {
  audiences: MenuAudience[]
}

const DesktopMegaMenu = ({ audiences }: Props) => {
  const [openHandle, setOpenHandle] = useState<string | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const openDropdown = useCallback(
    (handle: string) => {
      clearCloseTimer()
      setOpenHandle(handle)
    },
    [clearCloseTimer]
  )

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = setTimeout(() => {
      setOpenHandle(null)
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  const closeNow = useCallback(() => {
    clearCloseTimer()
    setOpenHandle(null)
  }, [clearCloseTimer])

  // Cleanup the timer if the component unmounts mid-grace.
  useEffect(() => {
    return () => clearCloseTimer()
  }, [clearCloseTimer])

  // Close on Escape — keyboard escape hatch, doubles as "I'm done browsing".
  useEffect(() => {
    if (!openHandle) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNow()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openHandle, closeNow])

  // Pathname change → close. Catches the case where a sub-link is clicked
  // and the navigation completes — the link's onClick also calls closeNow
  // but this is the belt-and-braces for browser back/forward etc.
  const lastPathnameRef = useRef(pathname)
  useEffect(() => {
    if (pathname !== lastPathnameRef.current) {
      lastPathnameRef.current = pathname
      closeNow()
    }
  }, [pathname, closeNow])

  if (audiences.length === 0) return null

  const activeAudience =
    openHandle === null
      ? null
      : (audiences.find((a) => a.handle === openHandle) ?? null)

  // Returned as a Fragment so the dropdown can be positioned relative to
  // the nearest positioned ancestor that wraps the WHOLE header — namely
  // the parent `<header className="relative">`. If we wrapped these two
  // pieces in an intermediate `relative` div, the dropdown's `left-0
  // right-0` would only span the local container width (just the trigger
  // row), not the full header width. The trigger row's outer <nav> uses
  // `relative` on the inner UL only so its hover region doesn't extend
  // sideways into adjacent flex slots.
  return (
    <>
      <nav
        aria-label="Shop by audience"
        onMouseLeave={scheduleClose}
      >
        <ul className="flex items-center gap-x-1">
          {audiences.map((audience) => {
            const isOpen = openHandle === audience.handle
            return (
              <li
                key={audience.handle}
                onMouseEnter={() => openDropdown(audience.handle)}
                onFocus={() => openDropdown(audience.handle)}
              >
                <LocalizedClientLink
                  href={`/categories/${audience.handle}`}
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  className={[
                    "inline-flex items-center px-3 py-3 text-sm font-medium tracking-wide whitespace-nowrap",
                    "transition-colors duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/60 focus-visible:rounded",
                    isOpen
                      ? "text-[var(--brand-accent)]"
                      : "text-white hover:text-[var(--brand-accent)]",
                  ].join(" ")}
                >
                  {audience.name}
                </LocalizedClientLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Dropdown panel — sibling to the trigger row inside the parent
          `<header className="relative">`. `left-0 right-0 top-full` spans
          the full header width and drops the panel immediately below it. */}
      {activeAudience ? (
        <div
          className="absolute left-0 right-0 top-full z-40"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        >
          <div className="border-t border-white/10 bg-[rgba(12,17,23,0.95)] backdrop-blur-2xl shadow-lg">
            <AudienceDropdown
              audience={activeAudience}
              onLinkClick={closeNow}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

export default DesktopMegaMenu
