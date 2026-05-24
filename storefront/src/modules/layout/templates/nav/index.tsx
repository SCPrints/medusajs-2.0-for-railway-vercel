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
 * Single-row sticky header — everything in one bar.
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │  Mens · Womens · Kids · Workwear · Corporates · Healthcare         │
 *   │                              [Logo]                                │
 *   │              Brands · Services · Best Sellers · Account · 📞 🔍 🛒 │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Layout uses absolute-positioned logo dead-center so the left audience
 * nav and right utility nav can grow/shrink without nudging the logo. The
 * audience-dropdown panel is rendered by DesktopMegaMenu as a sibling to
 * the trigger row, positioned `absolute left-0 right-0 top-full` relative
 * to the `<header>` element — that's why <header> carries `relative`.
 *
 * Below `small:` (1024px) the audience nav collapses to a hamburger
 * (MobileMegaMenu) on the left that reveals the same audiences in a
 * vertical accordion. Phone/search/cart stay visible on the right at all
 * widths; Brands/Services/Best Sellers/Account text links hide below
 * `small:` (they're inside the hamburger overlay instead).
 *
 * The previous separate second row + the old single-panel side-menu
 * component (storefront/src/modules/layout/components/side-menu/) are
 * left in place for reference but no longer rendered.
 */

export default function Nav() {
  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-20 mx-auto bg-ui-fg-base duration-200">
        <nav className="content-container flex h-full w-full items-center text-base font-medium text-white">
          {/* LEFT: audience nav (desktop) or hamburger (mobile). Both
              fetch the same audiences list — Suspense isolates them so
              the header logo never waits on the menu round trip. */}
          <div className="flex flex-1 h-full items-center min-w-0">
            <Suspense
              fallback={<div aria-hidden className="h-full w-10" />}
            >
              <LeftSlot />
            </Suspense>
          </div>

          {/* CENTER (absolute): logo. Sits dead-center regardless of how
              much room the left/right slots take up. `pointer-events-none`
              on the wrapper lets clicks pass through the empty side
              regions; the link inside re-enables them on the logo itself. */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
          >
            <LocalizedClientLink
              href="/"
              prefetch={false}
              className="inline-flex items-center pointer-events-auto"
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

          {/* RIGHT: utility (phone, search, text links, cart). */}
          <div className="flex h-full flex-1 items-center justify-end gap-x-2 leading-none phone:gap-x-3 tablet:gap-x-4 small:gap-x-5">
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
    </div>
  )
}

/**
 * Single async server slot that switches between the desktop audience
 * nav and the mobile hamburger via CSS — both branches always render so
 * the SSR HTML is identical on both breakpoints, and the right one
 * shows after the responsive media query kicks in.
 */
async function LeftSlot() {
  const audiences = await listShopCategoriesMenu().catch(() => [])
  return (
    <>
      {/* Mobile: hamburger only. Visible below `small:`. */}
      <div className="small:hidden h-full flex items-center">
        <MobileMegaMenu audiences={audiences} />
      </div>
      {/* Desktop: audience nav. Visible at `small:` and up. */}
      <div className="hidden small:flex h-full items-center">
        <DesktopMegaMenu audiences={audiences} />
      </div>
    </>
  )
}
