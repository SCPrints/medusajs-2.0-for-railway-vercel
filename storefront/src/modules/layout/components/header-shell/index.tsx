"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"

import type { MenuAudience } from "@lib/data/shop-categories-menu"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import DesktopMegaMenu from "@modules/layout/components/mega-menu/desktop-mega-menu"
import MobileMegaMenu from "@modules/layout/components/mega-menu/mobile-mega-menu"
import NavSearchTrigger from "@modules/search/components/nav-search-trigger"

/**
 * Two-row sticky header with scroll-direction-aware collapse.
 *
 * State machine adapted from Colour Cartel's <sticky-header> custom element
 * (https://thecolourcartel.com.au/cdn/shop/t/69/assets/header.js). Instead
 * of flipping state on per-event direction, we accumulate scroll distance
 * in the current direction; on direction reversal we reset the counter to
 * 0 and start over. State only commits once SCROLL_DISTANCE_THRESHOLD px
 * have accumulated in the new direction.
 *
 * Why: a 48px reverse-delta event from browser scroll-anchoring (fired
 * when row 2's height shrinks above the viewport anchor) just resets the
 * direction counter — it can't flip state on its own. That removes the
 * bounce loop the prior per-event-direction implementation hit and lets
 * us drop the time-based animation lock entirely.
 *
 * The CSS `overflow-anchor: none` on <html> in globals.css disables the
 * anchor mechanism upstream; the distance threshold is a second line of
 * defence against any other reflow-driven scroll events (momentum jitter,
 * trackpad noise, browser-internal scroll adjustments).
 *
 * Layout:
 *   ROW 1 (h-20, always visible):
 *     [hamburger* | logo] · · · [search] [account] [cart]
 *     * mobile: MobileMegaMenu hamburger (always)
 *     * desktop: condensed hamburger appears ONLY when row 2 has been
 *       collapsed by scrolling.
 *   ROW 2 (h-12, desktop-only, collapsible):
 *     [Mens · Womens · Kids · Workwear · Corporates · Healthcare · Accessories]
 *     · · · [Brands · Services · Best Sellers]
 *
 * Scroll behaviour (desktop only — mobile never shows row 2):
 *   - scrollY < 10                  → expanded (force)
 *   - scrolling DOWN ≥200px past 80 → condensed (hamburger appears in row 1)
 *   - scrolling UP ≥200px           → expanded
 *   - hamburger click               → expanded + 1000ms cooldown so the
 *                                     user's continuing scroll doesn't
 *                                     immediately re-collapse
 *
 * Row 2 uses Framer Motion height+opacity animation. The motion wrapper
 * has overflow:hidden which clips both the trigger row AND any open
 * DesktopMegaMenu dropdown panel (the panel is absolute-positioned
 * inside the same wrapper). That makes the dropdown visually disappear
 * the instant row 2 collapses — no separate force-close needed.
 *
 * Cart slot is passed in from the server component because <CartButton>
 * is an async server component — it can't be imported into a client
 * file but can be passed as a ReactNode child.
 */

const COLLAPSE_THRESHOLD = 80
const SCROLL_DISTANCE_THRESHOLD = 200
const MANUAL_TOGGLE_COOLDOWN_MS = 1000

type ScrollDirection = "up" | "down" | "none"

type Props = {
  audiences: MenuAudience[]
  cartSlot: React.ReactNode
}

export default function HeaderShell({ audiences, cartSlot }: Props) {
  const [isCondensed, setIsCondensed] = useState(false)
  const isCondensedRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const scrollDirectionRef = useRef<ScrollDirection>("none")
  const scrollDistanceRef = useRef(0)
  const manualToggleUntilRef = useRef(0)

  const setCondensed = useCallback((next: boolean) => {
    if (isCondensedRef.current === next) return
    isCondensedRef.current = next
    setIsCondensed(next)
  }, [])

  useEffect(() => {
    let rafScheduled = false

    const handleScroll = () => {
      // Coalesce bursts of scroll events into one frame. Reads of
      // window.scrollY are cheap but coalescing keeps the state machine
      // from advancing through multiple per-frame events with stale data.
      if (rafScheduled) return
      rafScheduled = true
      requestAnimationFrame(() => {
        rafScheduled = false

        const y = window.scrollY
        const last = lastScrollYRef.current
        const newDirection: ScrollDirection =
          y > last ? "down" : y < last ? "up" : scrollDirectionRef.current

        if (newDirection !== scrollDirectionRef.current) {
          // Direction flip — reset the counter. Small reverse-delta
          // events (scroll anchoring, momentum settling, trackpad
          // jitter) land here and CAN'T flip state on their own.
          scrollDirectionRef.current = newDirection
          scrollDistanceRef.current = 0
        } else {
          scrollDistanceRef.current += Math.abs(y - last)
        }

        lastScrollYRef.current = y

        // Force expanded near the top regardless of accumulated distance —
        // matches the "back at top = unconditional restore" behaviour from
        // Colour Cartel's handleScrolledBeforeHeader.
        if (y < 10) {
          setCondensed(false)
          return
        }

        // Honour manual hamburger toggle for a brief cooldown.
        if (Date.now() < manualToggleUntilRef.current) return

        if (scrollDistanceRef.current < SCROLL_DISTANCE_THRESHOLD) return

        if (newDirection === "down" && y > COLLAPSE_THRESHOLD) {
          setCondensed(true)
          scrollDistanceRef.current = 0
        } else if (newDirection === "up") {
          setCondensed(false)
          scrollDistanceRef.current = 0
        }
      })
    }

    // Sync on mount — handles reload-on-scrolled-page.
    lastScrollYRef.current = window.scrollY
    if (window.scrollY > COLLAPSE_THRESHOLD) setCondensed(true)

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [setCondensed])

  const handleHamburgerClick = useCallback(() => {
    setCondensed(false)
    manualToggleUntilRef.current = Date.now() + MANUAL_TOGGLE_COOLDOWN_MS
    // Reset the distance counter too so the user's first scroll-down
    // after clicking starts fresh from 0 rather than carrying leftover
    // accumulation from before the click.
    scrollDistanceRef.current = 0
  }, [setCondensed])

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative mx-auto bg-ui-fg-base">
        {/* ROW 1 — utility, always visible */}
        <div className="content-container flex h-20 w-full items-center gap-x-3 phone:gap-x-4 small:gap-x-5 text-base font-medium text-white">
          {/* Mobile hamburger — drives MobileMegaMenu's full overlay */}
          <div className="small:hidden flex h-full items-center">
            <MobileMegaMenu audiences={audiences} />
          </div>

          {/* Logo — left-aligned (replaces the absolute-center variant) */}
          <LocalizedClientLink
            href="/"
            className="inline-flex items-center shrink-0"
            data-testid="nav-store-link"
            aria-label="SC Prints home"
          >
            <Image
              src="/branding/sc-prints-logo-transparent.png"
              alt="SC Prints"
              width={158}
              height={52}
              className="h-10 w-auto invert"
              priority
            />
          </LocalizedClientLink>

          {/* Desktop condensed hamburger — only visible when row 2 has
              been collapsed by scrolling */}
          <AnimatePresence initial={false}>
            {isCondensed && (
              <motion.button
                key="condensed-hamburger"
                type="button"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                onClick={handleHamburgerClick}
                aria-label="Show shop categories"
                aria-expanded={false}
                className="hidden small:inline-flex items-center justify-center min-h-10 min-w-10 text-[var(--brand-secondary)] hover:text-[var(--brand-accent)] transition-colors overflow-hidden"
                data-testid="nav-condensed-hamburger"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Spacer pushes the right cluster to the edge */}
          <div className="flex-1" />

          <NavSearchTrigger />

          {/* Account stays in row 1 — user-action, not browsing nav.
              Brands / Services / Best Sellers moved into row 2 next to
              the audiences so the right cluster reads cleanly. */}
          <LocalizedClientLink
            className="hidden small:flex h-full items-center hover:text-[var(--brand-accent)] transition-colors"
            href="/account"
            data-testid="nav-account-link"
          >
            Account
          </LocalizedClientLink>

          {cartSlot}
        </div>

        {/* ROW 2 — audience nav, desktop-only, collapsible */}
        <motion.div
          initial={false}
          animate={{
            height: isCondensed ? 0 : "auto",
            opacity: isCondensed ? 0 : 1,
          }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="hidden small:block overflow-hidden"
          aria-hidden={isCondensed}
        >
          <div className="content-container flex h-12 w-full items-center border-t border-white/10">
            <DesktopMegaMenu audiences={audiences} />

            {/* Supplementary nav — direct links (no dropdowns). Sits on
                the right end of row 2, sharing the audience trigger
                styling so the whole row reads as one nav bar. */}
            <div className="flex-1" />
            <div className="flex items-center gap-x-1">
              <LocalizedClientLink
                className="inline-flex items-center px-3 py-3 text-sm font-medium tracking-wide whitespace-nowrap transition-colors duration-150 text-[var(--brand-secondary)] hover:text-[var(--brand-accent)]"
                href="/brands"
                data-testid="nav-brands-link"
              >
                Brands
              </LocalizedClientLink>
              <LocalizedClientLink
                className="inline-flex items-center px-3 py-3 text-sm font-medium tracking-wide whitespace-nowrap transition-colors duration-150 text-[var(--brand-secondary)] hover:text-[var(--brand-accent)]"
                href="/services"
                data-testid="nav-services-link"
              >
                Services
              </LocalizedClientLink>
              <LocalizedClientLink
                className="inline-flex items-center px-3 py-3 text-sm font-medium tracking-wide whitespace-nowrap transition-colors duration-150 text-[var(--brand-secondary)] hover:text-[var(--brand-accent)]"
                href="/best-sellers"
                data-testid="nav-best-sellers-link"
              >
                Best Sellers
              </LocalizedClientLink>
            </div>
          </div>
        </motion.div>
      </header>
    </div>
  )
}
