import { Suspense } from "react"
import Image from "next/image"
import { MagnifyingGlassMini } from "@medusajs/icons"

import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

export default async function Nav() {
  const regions = await listRegions().then((regions: StoreRegion[]) => regions)

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-20 mx-auto border-b-2 border-white/20 bg-ui-fg-base duration-200">
        <nav className="content-container flex h-full w-full items-center justify-between gap-6 text-base font-medium text-[rgba(248,250,252,0.9)]">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              <SideMenu regions={regions} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="inline-flex items-center"
              data-testid="nav-store-link"
            >
              <Image
                src="/branding/scp-vector.svg"
                alt="SC Prints"
                width={158}
                height={52}
                className="h-12 w-auto"
                priority
              />
            </LocalizedClientLink>
          </div>

          <div className="flex h-full flex-1 basis-0 items-center justify-end gap-x-6 leading-none">
            <LocalizedClientLink
              className="flex h-full min-h-10 min-w-10 items-center justify-center hover:text-[var(--brand-accent)]"
              href="/search"
              scroll={false}
              data-testid="nav-search-link"
              aria-label="Search site"
            >
              <MagnifyingGlassMini
                className="block size-6 shrink-0 translate-y-1.5 text-[currentColor]"
                aria-hidden
              />
            </LocalizedClientLink>
            <div className="hidden small:flex items-center gap-x-6 h-full">
              <LocalizedClientLink
                className="flex h-full items-center hover:text-[var(--brand-accent)]"
                href="/account"
                data-testid="nav-account-link"
              >
                Account
              </LocalizedClientLink>
            </div>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="flex gap-2 text-base font-medium hover:text-[var(--brand-accent)]"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  Cart (0)
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
