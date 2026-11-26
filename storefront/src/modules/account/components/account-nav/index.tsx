"use client"

import { clx } from "@medusajs/ui"
import { ArrowRightOnRectangle } from "@medusajs/icons"
import { useParams, usePathname } from "next/navigation"

import ChevronDown from "@modules/common/icons/chevron-down"
import User from "@modules/common/icons/user"
import MapPin from "@modules/common/icons/map-pin"
import Package from "@modules/common/icons/package"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"
import { signout } from "@lib/data/customer"

type NavLink = { href: string; label: string; testId: string; icon?: "user" | "pin" }

/**
 * One list for both layouts. Grouped under short headings so thirteen links
 * read as four small lists. "Overview" is desktop only (on a phone the
 * account page itself is this menu).
 */
const NAV_GROUPS: Array<{ title: string; links: NavLink[] }> = [
  {
    title: "Account",
    links: [
      { href: "/account/profile", label: "Profile", testId: "profile-link", icon: "user" },
      { href: "/account/addresses", label: "Addresses", testId: "addresses-link", icon: "pin" },
    ],
  },
  {
    title: "Orders",
    links: [
      { href: "/account/orders", label: "Orders", testId: "orders-link" },
      { href: "/account/quotes", label: "Quotes", testId: "quotes-link" },
      { href: "/account/group-orders", label: "Group orders", testId: "group-orders-link" },
    ],
  },
  {
    title: "Designs",
    links: [
      { href: "/account/designs", label: "My designs", testId: "designs-link" },
      { href: "/account/artwork", label: "My artwork", testId: "artwork-link" },
      // No Wishlist link: nothing can add to it since the product page's save
      // button went with the old product page (Jul 2026). Put it back with one.
    ],
  },
  {
    title: "Business",
    links: [
      { href: "/account/organisations", label: "Organisations", testId: "organisations-link" },
      { href: "/account/prices", label: "Prices", testId: "prices-link" },
      { href: "/account/spend", label: "Spend", testId: "spend-link" },
      { href: "/account/documents", label: "Documents", testId: "documents-link" },
    ],
  },
]

const groupHeading = "text-xs font-semibold uppercase tracking-widest text-ui-fg-muted"

const AccountNav = ({
  customer,
}: {
  customer: HttpTypes.StoreCustomer | null
}) => {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => {
    await signout(countryCode)
  }

  return (
    <div>
      <div className="small:hidden" data-testid="mobile-account-nav">
        {route !== `/${countryCode}/account` ? (
          <LocalizedClientLink
            href="/account"
            className="flex items-center gap-x-2 text-small-regular py-2"
            data-testid="account-main-link"
          >
            <>
              <ChevronDown className="transform rotate-90" />
              <span>Account</span>
            </>
          </LocalizedClientLink>
        ) : (
          <>
            <div className="text-xl-semi mb-4 px-5">
              Hello {customer?.first_name}
            </div>
            <div className="text-base-regular">
              {NAV_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className={clx(groupHeading, "bg-ui-bg-subtle px-5 py-2")}>{group.title}</p>
                  <ul>
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <LocalizedClientLink
                          href={link.href}
                          className="flex min-h-14 items-center justify-between border-b border-gray-200 px-5 py-4"
                          data-testid={link.testId}
                        >
                          <div className="flex items-center gap-x-3">
                            {link.icon === "user" ? <User size={20} /> : link.icon === "pin" ? <MapPin size={20} /> : <Package size={20} />}
                            <span>{link.label}</span>
                          </div>
                          <ChevronDown className="transform -rotate-90" />
                        </LocalizedClientLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between border-b border-gray-200 px-5 py-4"
                onClick={handleLogout}
                data-testid="logout-button"
              >
                <div className="flex items-center gap-x-3">
                  <ArrowRightOnRectangle />
                  <span>Log out</span>
                </div>
                <ChevronDown className="transform -rotate-90" />
              </button>
            </div>
          </>
        )}
      </div>
      <div className="hidden small:block" data-testid="account-nav">
        <div className="text-base-regular flex flex-col gap-y-5">
          {NAV_GROUPS.map((group, i) => (
            <div key={group.title}>
              <h3 className={clx(groupHeading, "pb-2")}>{group.title}</h3>
              <ul className="flex mb-0 justify-start items-start flex-col gap-y-2">
                {i === 0 ? (
                  <li>
                    <AccountNavLink href="/account" route={route!} data-testid="overview-link">
                      Overview
                    </AccountNavLink>
                  </li>
                ) : null}
                {group.links.map((link) => (
                  <li key={link.href}>
                    <AccountNavLink href={link.href} route={route!} data-testid={link.testId}>
                      {link.label}
                    </AccountNavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="text-grey-700">
            <button type="button" onClick={handleLogout} data-testid="logout-button">
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type AccountNavLinkProps = {
  href: string
  route: string
  children: React.ReactNode
  "data-testid"?: string
}

const AccountNavLink = ({
  href,
  route,
  children,
  "data-testid": dataTestId,
}: AccountNavLinkProps) => {
  const { countryCode }: { countryCode: string } = useParams()

  // A section stays lit on its sub-pages (a quote, an order's details).
  const current = route.split(countryCode)[1] ?? ""
  const active = current === href || (href !== "/account" && current.startsWith(`${href}/`))
  return (
    <LocalizedClientLink
      href={href}
      className={clx("text-ui-fg-subtle hover:text-ui-fg-base", {
        "text-ui-fg-base font-semibold": active,
      })}
      data-testid={dataTestId}
    >
      {children}
    </LocalizedClientLink>
  )
}

export default AccountNav
