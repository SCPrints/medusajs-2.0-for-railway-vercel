import { Suspense } from "react"
import Image from "next/image"

import {
  SC_PRINTS_PHONE_DISPLAY,
  SC_PRINTS_PHONE_HREF,
} from "@lib/constants"
import { listShopCategoriesMenu } from "@lib/data/shop-categories-menu"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import DesktopMegaMenu from "@modules/layout/components/mega-menu/desktop-mega-menu"
import MobileMegaMenu from "@modules/layout/components/mega-menu/mobile-mega-menu"
import NavSearchTrigger from "@modules/search/components/nav-search-trigger"

/**
 * Two-row sticky header.
 *
 * Row 1 (always visible)
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  [Mobile hamburger]      [Logo]      [Right utility nav]       │
 *   └────────────────────────────────────────────────────────────────┘
 *   - Mobile hamburger (<1024px) opens the MobileMegaMenu accordion overlay.
 *   - Logo centered; clicks home.
 *   - Right utility: phone, search, Brands, Services, Best Sellers, Account, Cart.
 *     Brands / Services / Best Sellers / Account are text links hidden below
 *     `small:` (1024px); on mobile they live inside the hamburger overlay instead.
 *
 * Row 2 (desktop only, ≥1024px)
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  Mens · Womens · Kids · Workwear · Corporates · Healthcare     │
 *   └────────────────────────────────────────────────────────────────┘
 *   - Hover any audience → its dropdown panel reveals below the row.
 *   - Click navigates to /categories/<audience-handle> landing page.
 *   - DesktopMegaMenu orchestrates the open/close state across triggers.
 *
 * The previous single-panel "Menu" overlay (storefront/src/modules/layout/
 * components/side-menu/index.tsx) is no longer rendered but left in place
 * for reference / rollback. Safe to delete once the new menu is in
 * production for a release cycle.
 */

export default function Nav() {
  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      {/* Row 1 — logo + utility */}
      <header className="relative h-20 mx-auto bg-ui-fg-base duration-200">
        <nav className="content-container flex h-full w-full items-center justify-between gap-6 text-base font-medium text-white">
          {/* Left: mobile hamburger. On desktop this slot is invisible —
              the audience nav lives in Row 2. */}
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full small:invisible">
              <Suspense
                fallback={
                  <div aria-hidden className="h-full w-10" />
                }
              >
                <Row1MobileHamburger />
              </Suspense>
            </div>
          </div>

          {/* Center: logo */}
          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              prefetch={false}
              className="inline-flex items-center"
              data-testid="nav-store-link"
            >
              <Image
                src="/branding/sc-prints-logo-transparent.png"
                alt="SC Prints"
                width={158}
                height={52}
                className="h-12 w-auto invert"
                priority
              />
            </LocalizedClientLink>
          </div>

          {/* Right: utility */}
          <div className="flex h-full flex-1 basis-0 items-center justify-end gap-x-2 leading-none phone:gap-x-3 tablet:gap-x-4 small:gap-x-5">
            <a
              href={SC_PRINTS_PHONE_HREF}
              className="flex h-full min-h-10 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white transition-colors hover:text-[var(--brand-accent)]"
              aria-label={`Call SC Prints on ${SC_PRINTS_PHONE_DISPLAY}`}
              data-testid="nav-phone-link"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 011.18 4.18 2 2 0 013.08 2H6a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
              </svg>
              <span className="hidden tablet:inline">
                {SC_PRINTS_PHONE_DISPLAY}
              </span>
            </a>

            <NavSearchTrigger />

            {/* Text-link cluster — hidden on phone/tablet (those users get
                these links inside the hamburger overlay instead). */}
            <div className="hidden small:flex items-center gap-x-5 h-full">
              <LocalizedClientLink
                className="flex h-full items-center hover:text-[var(--brand-accent)] transition-colors"
                href="/brands"
                prefetch={false}
                data-testid="nav-brands-link"
              >
                Brands
              </LocalizedClientLink>
              <LocalizedClientLink
                className="flex h-full items-center hover:text-[var(--brand-accent)] transition-colors"
                href="/services"
                prefetch={false}
                data-testid="nav-services-link"
              >
                Services
              </LocalizedClientLink>
              <LocalizedClientLink
                className="flex h-full items-center hover:text-[var(--brand-accent)] transition-colors"
                href="/best-sellers"
                prefetch={false}
                data-testid="nav-best-sellers-link"
              >
                Best Sellers
              </LocalizedClientLink>
              <LocalizedClientLink
                className="flex h-full items-center hover:text-[var(--brand-accent)] transition-colors"
                href="/account"
                prefetch={false}
                data-testid="nav-account-link"
              >
                Account
              </LocalizedClientLink>
            </div>

            <Suspense
              fallback={
                <LocalizedClientLink
                  className="flex h-full min-h-10 min-w-10 items-center justify-center whitespace-nowrap text-base font-medium hover:text-[var(--brand-accent)]"
                  href="/cart"
                  prefetch={false}
                  data-testid="nav-cart-link"
                  aria-label="View cart"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="9" cy="20" r="1.5" />
                    <circle cx="18" cy="20" r="1.5" />
                    <path d="M3 4h2l3 12h12l2-8H7" />
                  </svg>
                  <span className="hidden tablet:ml-1.5 tablet:inline">Cart (0)</span>
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>

      {/* Row 2 — audience nav (desktop only) */}
      <div className="hidden small:block bg-ui-fg-base/95 border-t border-white/10 backdrop-blur-sm">
        <Suspense
          fallback={
            <div className="h-12" aria-hidden />
          }
        >
          <Row2DesktopNav />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * Server component fetching the menu data once and slotting it into
 * Row 1 (hamburger only) and Row 2 (desktop nav).
 *
 * We split into two server components reading the same cached fetch so
 * each row can be Suspended independently — the header logo doesn't
 * wait on the menu network round trip.
 */
async function Row1MobileHamburger() {
  const audiences = await listShopCategoriesMenu().catch(() => [])
  return <MobileMegaMenu audiences={audiences} />
}

async function Row2DesktopNav() {
  const audiences = await listShopCategoriesMenu().catch(() => [])
  if (audiences.length === 0) {
    // No populated audiences — render an empty row to preserve the
    // header's stable height rather than a layout shift.
    return <div className="h-12" aria-hidden />
  }
  return (
    <div className="h-12 flex items-center">
      <DesktopMegaMenu audiences={audiences} />
    </div>
  )
}
