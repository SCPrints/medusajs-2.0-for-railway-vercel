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
 * Layout:
 *   ROW 1 (h-20, always visible):
 *     [hamburger* | logo] · · · [phone] [search] [text-links] [cart]
 *     * mobile: MobileMegaMenu hamburger (always)
 *     * desktop: condensed hamburger appears ONLY when row 2 has been
 *       collapsed by scrolling.
 *   ROW 2 (h-12, desktop-only, collapsible):
 *     [Mens · Womens · Kids · Workwear · Corporates · Healthcare · Accessories]
 *
 * Scroll behaviour (desktop only — mobile never shows row 2):
 *   - scrollY < 10            → expanded (force)
 *   - scrolling DOWN past 80  → condensed (hamburger appears in row 1)
 *   - scrolling UP            → expanded
 *   - hamburger click         → expanded + 500ms grace so a tiny scroll
 *                               doesn't immediately re-condense
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
const SCROLL_DEADZONE = 4
const HAMBURGER_GRACE_MS = 500
// Must exceed the Framer height animation duration (220ms). When row 2's
// height animates, the sticky header's footprint in the document changes
// every frame and the browser fires scroll events to follow the reflow.
// Those events arrive with reversed deltas relative to the user's actual
// scroll direction; without this lock the state flips back, the animation
// reverses, and the row bounces 6-7× before settling.
const STATE_LOCK_MS = 280

type Props = {
  audiences: MenuAudience[]
  cartSlot: React.ReactNode
}

export default function HeaderShell({ audiences, cartSlot }: Props) {
  const [isCondensed, setIsCondensed] = useState(false)
  const isCondensedRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const graceUntilRef = useRef(0)
  const stateLockUntilRef = useRef(0)

  const setCondensed = useCallback((next: boolean) => {
    if (isCondensedRef.current === next) return
    isCondensedRef.current = next
    setIsCondensed(next)
    // Block further toggles until the height animation finishes so the
    // browser's animation-induced scroll events can't bounce us back.
    stateLockUntilRef.current = Date.now() + STATE_LOCK_MS
  }, [])

  useEffect(() => {
    // Passive scroll listener fires at the browser's natural rate (already
    // throttled to vsync by every modern engine). Adding RAF on top broke
    // verification in headless browsers that pause RAF — and the
    // ref-mirrored setCondensed already short-circuits no-op transitions,
    // so the React render cost is bounded.
    const handleScroll = () => {
      const y = window.scrollY
      const last = lastScrollYRef.current
      const diff = y - last
      // Always advance the baseline so neither lock window leaves a stale
      // anchor that turns the next real scroll into a giant phantom delta.
      lastScrollYRef.current = y

      const now = Date.now()

      // Post-hamburger grace: don't re-condense from the user's continued
      // scroll for a brief moment after they manually expanded the row.
      if (now < graceUntilRef.current) return

      // Post-toggle lock: ignore scroll events caused by the row 2 height
      // animation itself. See STATE_LOCK_MS comment for the gory details.
      if (now < stateLockUntilRef.current) return

      if (Math.abs(diff) < SCROLL_DEADZONE) return

      if (y < 10) {
        setCondensed(false)
      } else if (diff > 0 && y > COLLAPSE_THRESHOLD) {
        setCondensed(true)
      } else if (diff < 0) {
        setCondensed(false)
      }
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
    graceUntilRef.current = Date.now() + HAMBURGER_GRACE_MS
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
