import { Suspense } from "react"

import { listShopCategoriesMenu } from "@lib/data/shop-categories-menu"
import CartButton from "@modules/layout/components/cart-button"
import HeaderShell from "@modules/layout/components/header-shell"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * Server entrypoint for the global sticky header.
 *
 * Fetches the audience tree (Mens / Womens / Kids / …) on the server,
 * then hands rendering off to <HeaderShell> — a client component that
 * owns the two-row layout, scroll-direction collapse animation, and
 * desktop hamburger toggle. See HeaderShell for the full UX spec.
 *
 * The cart button is a Suspense-wrapped async server component, so it's
 * passed as a slot (ReactNode prop) rather than imported into the client
 * shell.
 */
export default async function Nav() {
  const audiences = await listShopCategoriesMenu().catch(() => [])

  return (
    <HeaderShell
      audiences={audiences}
      cartSlot={
        <Suspense
          fallback={
            <LocalizedClientLink
              className="flex h-full min-h-10 min-w-10 items-center justify-center whitespace-nowrap text-base font-medium hover:text-[var(--brand-accent)]"
              href="/cart"
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
      }
    />
  )
}
