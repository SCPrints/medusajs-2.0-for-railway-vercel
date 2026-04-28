import Image from "next/image"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="w-full min-h-dvh flex flex-col bg-[var(--brand-background)] text-[var(--brand-primary)]">
      <header className="sticky top-0 z-50 border-b-2 border-white/20 bg-ui-fg-base">
        <nav className="content-container flex h-20 w-full items-center justify-between gap-4 text-base font-medium text-[rgba(248,250,252,0.9)]">
          <LocalizedClientLink
            href="/cart"
            className="checkout-nav-link flex flex-1 basis-0 items-center gap-x-2 text-sm font-semibold uppercase tracking-wide !text-[rgba(248,250,252,0.9)] transition-colors hover:!text-[var(--brand-accent)]"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90 shrink-0" size={16} />
            <span className="mt-px hidden small:block">
              Back to shopping cart
            </span>
            <span className="mt-px block small:hidden">Back</span>
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/"
            className="inline-flex items-center"
            data-testid="store-link"
            aria-label="SC Prints home"
          >
            <Image
              src="/branding/scp-vector.svg"
              alt="SC Prints"
              width={158}
              height={52}
              className="h-12 w-auto"
              priority
            />
            <span className="sr-only">SC Prints</span>
          </LocalizedClientLink>
          <div className="flex flex-1 basis-0 items-center justify-end">
            <LocalizedClientLink
              href="/"
              className="checkout-nav-link checkout-nav-link--subtle hidden small:inline text-sm font-normal"
            >
              Continue shopping
            </LocalizedClientLink>
          </div>
        </nav>
      </header>
      <div
        className="relative flex-1"
        data-testid="checkout-container"
      >
        {children}
      </div>
    </div>
  )
}
