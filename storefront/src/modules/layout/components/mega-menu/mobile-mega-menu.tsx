"use client"

import { Popover } from "@headlessui/react"
import { XMark } from "@medusajs/icons"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { MenuAudience } from "@lib/data/shop-categories-menu"

/**
 * Mobile mega-menu — phone + tablet (<1024px).
 *
 * Hamburger reveals a full-screen overlay with a vertical accordion of
 * audiences. Each audience row expands to show its subs as a flat list
 * (no cluster grouping on mobile — the screen's too narrow for columns,
 * and the cluster headers eat vertical space that's better spent on
 * actual links). Below the audiences sit the persistent right-side items
 * (Brands, Services, Industries, Best Sellers, Account, Contact) so a
 * mobile user can reach everything the desktop nav offers in one place.
 *
 * Visible only below `small:` (1024px) breakpoint — desktop has its own
 * horizontal dropdowns.
 */

type Props = {
  audiences: MenuAudience[]
}

const MobileMegaMenu = ({ audiences }: Props) => {
  return (
    <Popover className="small:hidden h-full">
      {({ open, close }) => (
        <>
          <Popover.Button
            data-testid="mobile-nav-menu-button"
            data-no-squish
            aria-label="Open navigation menu"
            className="relative h-full flex min-h-11 min-w-11 items-center gap-2 text-base font-medium text-[var(--brand-secondary)] transition-all ease-out duration-200 focus:outline-none hover:text-[var(--brand-accent)]"
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
            <span className="hidden phone:inline">Menu</span>
          </Popover.Button>

          <Popover.Overlay className="fixed inset-0 z-[35] bg-[var(--brand-primary)]/35 backdrop-blur-sm" />

          <Popover.Panel
            data-testid="mobile-nav-menu-popup"
            className="fixed inset-x-0 top-20 bottom-0 z-40 flex flex-col overflow-hidden border-t-2 border-white/20 bg-[rgba(12,17,23,0.95)] text-sm text-[#F8FAFC] shadow-lg outline-none backdrop-blur-2xl"
          >
            <div
              className="content-container flex min-h-0 flex-1 flex-col py-6 overflow-y-auto"
              style={{
                paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
              }}
            >
              <div className="flex shrink-0 justify-end pb-3">
                <button
                  type="button"
                  onClick={() => close()}
                  aria-label="Close menu"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-[#F8FAFC] hover:text-[var(--brand-accent)] transition-colors"
                >
                  <XMark />
                </button>
              </div>

              {/* Audiences accordion */}
              <nav aria-label="Shop by audience" className="flex flex-col gap-y-1">
                {audiences.map((audience) => (
                  <MobileAudienceRow
                    key={audience.handle}
                    audience={audience}
                    onLinkClick={close}
                  />
                ))}
              </nav>

              {/* Persistent links — duplicates the desktop's right-side
                  utility nav so mobile users get the full map. */}
              <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-y-1">
                <MobileTopLink href="/brands" onClick={close}>
                  Brands
                </MobileTopLink>
                <MobileTopLink href="/services" onClick={close}>
                  Services
                </MobileTopLink>
                <MobileTopLink href="/industries" onClick={close}>
                  Industries
                </MobileTopLink>
                <MobileTopLink href="/best-sellers" onClick={close}>
                  Best Sellers
                </MobileTopLink>
                <MobileTopLink href="/account" onClick={close}>
                  Account
                </MobileTopLink>
                <MobileTopLink href="/contact" onClick={close}>
                  Contact
                </MobileTopLink>
              </div>
            </div>
          </Popover.Panel>
        </>
      )}
    </Popover>
  )
}

const MobileAudienceRow = ({
  audience,
  onLinkClick,
}: {
  audience: MenuAudience
  onLinkClick: () => void
}) => {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close the accordion if the user navigates while it's open — keeps
  // state from leaking across pages.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="border-b border-white/5">
      <div className="flex items-center justify-between">
        {/* Audience link — taps go straight to /categories/<audience> page. */}
        <LocalizedClientLink
          href={`/categories/${audience.handle}`}
          onClick={onLinkClick}
          className="flex-1 py-3 text-base font-medium text-[#F8FAFC] hover:text-[var(--brand-accent)] transition-colors"
        >
          {audience.name}
        </LocalizedClientLink>
        {/* Separate expand button — toggles the sub-list without
            navigating. 44x44 hit target per the project's mobile rule. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${audience.name}` : `Expand ${audience.name}`}
          aria-expanded={open}
          className="min-h-11 min-w-11 inline-flex items-center justify-center text-[#F8FAFC]/60 hover:text-[var(--brand-accent)] transition-transform duration-150"
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </div>
      {open ? (
        <ul className="pb-3 pl-4 flex flex-col gap-y-1">
          {audience.subs.map((sub) => (
            <li key={sub.handle}>
              <LocalizedClientLink
                href={`/categories/${sub.handle}`}
                onClick={onLinkClick}
                className="flex items-center justify-between py-2 text-sm text-[#F8FAFC]/85 hover:text-[var(--brand-accent)] transition-colors"
              >
                <span>{sub.name}</span>
                <span className="text-xs text-[#F8FAFC]/40">
                  {sub.product_count}
                </span>
              </LocalizedClientLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const MobileTopLink = ({
  href,
  onClick,
  children,
}: {
  href: string
  onClick: () => void
  children: React.ReactNode
}) => (
  <LocalizedClientLink
    href={href}
    onClick={onClick}
    className="py-3 text-base font-medium text-[#F8FAFC] hover:text-[var(--brand-accent)] transition-colors border-b border-white/5"
  >
    {children}
  </LocalizedClientLink>
)

export default MobileMegaMenu
