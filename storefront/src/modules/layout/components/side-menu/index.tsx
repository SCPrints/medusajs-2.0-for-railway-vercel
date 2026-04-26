"use client"

import { Popover, Transition } from "@headlessui/react"
import { ArrowRightMini, XMark } from "@medusajs/icons"
import { clx, useToggleState } from "@medusajs/ui"
import { Fragment } from "react"
import NavLink from "@modules/common/components/nav-link"
import CountrySelect from "../country-select"
import { services } from "@modules/services/data"
import { HttpTypes } from "@medusajs/types"

const MENU_COLLECTIONS_CAP = 10

const SideMenuItems = {
  Home: "/",
  Store: "/store",
  Customizer: "/customizer",
  Services: "/services",
  Brands: "/brands",
  BYO: "/byo",
  "Contact Us": "/contact",
  Search: "/search",
  Account: "/account",
  Cart: "/cart",
}

export type SideMenuBrowseGroup = {
  title: string
  items: Array<{ label: string; href: string }>
}

const SERVICES_GROUP: SideMenuBrowseGroup = {
  title: "Services",
  items: services.map((s) => ({
    label: s.title,
    href: `/services/${s.slug}`,
  })),
}

const discoverAndHelpLinks: Array<{
  label: string
  href: string
  testId: string
}> = [
  { label: "Explore", href: "/explore", testId: "explore-link" },
  { label: "DTF builder", href: "/dtf-builder", testId: "dtf-builder-link" },
  { label: "FAQ", href: "/faq", testId: "faq-link" },
  {
    label: "Shipping policy",
    href: "/shipping-policy",
    testId: "shipping-policy-link",
  },
  {
    label: "Returns policy",
    href: "/returns-policy",
    testId: "returns-policy-link",
  },
  {
    label: "Privacy policy",
    href: "/privacy-policy",
    testId: "privacy-policy-link",
  },
]

export type MenuCollectionLink = {
  handle: string
  title: string
}

const SideMenu = ({
  regions,
  collectionLinks,
  categoryBrowseGroups = [],
}: {
  regions: HttpTypes.StoreRegion[] | null
  collectionLinks: MenuCollectionLink[]
  categoryBrowseGroups?: SideMenuBrowseGroup[]
}) => {
  const toggleState = useToggleState()
  const collectionPreview = collectionLinks.slice(0, MENU_COLLECTIONS_CAP)
  const hasMoreCollections = collectionLinks.length > MENU_COLLECTIONS_CAP

  const browseGroups: SideMenuBrowseGroup[] = [
    ...categoryBrowseGroups,
    SERVICES_GROUP,
  ].filter((g) => g.items.length > 0)

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  className="relative h-full flex items-center text-base font-medium text-[var(--brand-secondary)] transition-all ease-out duration-200 focus:outline-none hover:text-[var(--brand-accent)]"
                >
                  Menu
                </Popover.Button>
              </div>

              <Transition
                show={open}
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="opacity-0"
                enterTo="opacity-100 backdrop-blur-2xl"
                leave="transition ease-in duration-150"
                leaveFrom="opacity-100 backdrop-blur-2xl"
                leaveTo="opacity-0"
              >
                <Popover.Panel className="absolute left-0 z-30 m-2 flex h-[calc(100vh-1rem)] w-[calc(100%-1rem)] max-w-5xl flex-col text-sm text-[#F8FAFC] backdrop-blur-2xl">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex h-full flex-col justify-between rounded-rounded bg-[rgba(12,17,23,0.82)] p-6"
                  >
                    <div className="flex justify-end" id="xmark">
                      <button
                        data-testid="close-menu-button"
                        onClick={close}
                        className="text-[rgba(248,250,252,0.95)] hover:text-[var(--brand-secondary)]"
                      >
                        <XMark />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 no-scrollbar">
                      <div className="grid gap-8 lg:grid-cols-12 lg:gap-6">
                        <div className="lg:col-span-3">
                          <h2 className="mb-3 txt-compact-small uppercase tracking-[0.12em] text-[var(--brand-accent)]">
                            Quick links
                          </h2>
                          <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-1">
                            {Object.entries(SideMenuItems).map(([name, href]) => (
                              <li key={name}>
                                <NavLink
                                  href={href}
                                  onClick={close}
                                  className="text-xl leading-snug text-[rgba(248,250,252,0.96)] hover:text-[var(--brand-secondary)] min-[400px]:text-2xl"
                                  data-testid={`${name.toLowerCase()}-link`}
                                >
                                  {name}
                                </NavLink>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="lg:col-span-5">
                          <h2 className="mb-4 border-t border-[var(--brand-accent)]/35 pt-6 txt-compact-small uppercase tracking-[0.12em] text-[var(--brand-accent)] lg:border-t-0 lg:pt-0">
                            Browse products &amp; services
                          </h2>
                          <div className="grid gap-6 sm:grid-cols-2">
                            {browseGroups.map((group) => (
                              <div key={group.title}>
                                <h3 className="mb-2 txt-compact-small text-[var(--brand-accent)]">
                                  {group.title}
                                </h3>
                                <ul className="space-y-1">
                                  {group.items.map((item) => (
                                    <li key={`${group.title}-${item.label}`}>
                                      <NavLink
                                        href={item.href}
                                        onClick={close}
                                        className="text-sm leading-6 text-[rgba(248,250,252,0.95)] hover:text-[var(--brand-secondary)]"
                                      >
                                        {item.label}
                                      </NavLink>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-8 border-t border-[var(--brand-accent)]/35 pt-6 lg:col-span-4 lg:border-t-0 lg:pt-0">
                          <div>
                            <h2 className="mb-3 txt-compact-small uppercase tracking-[0.12em] text-[var(--brand-accent)]">
                              Discover &amp; help
                            </h2>
                            <ul className="space-y-1.5">
                              {discoverAndHelpLinks.map((item) => (
                                <li key={item.href}>
                                  <NavLink
                                    href={item.href}
                                    onClick={close}
                                    className="text-sm leading-6 text-[rgba(248,250,252,0.95)] hover:text-[var(--brand-secondary)]"
                                    data-testid={item.testId}
                                  >
                                    {item.label}
                                  </NavLink>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h2 className="mb-3 txt-compact-small uppercase tracking-[0.12em] text-[var(--brand-accent)]">
                              Shop by collection
                            </h2>
                            <ul className="space-y-1.5">
                              {collectionPreview.map((c) => (
                                <li key={c.handle}>
                                  <NavLink
                                    href={`/collections/${c.handle}`}
                                    onClick={close}
                                    className="text-sm leading-6 text-[rgba(248,250,252,0.95)] hover:text-[var(--brand-secondary)]"
                                    data-testid={`nav-menu-collection-${c.handle}`}
                                  >
                                    {c.title}
                                  </NavLink>
                                </li>
                              ))}
                              {hasMoreCollections && (
                                <li className="pt-1 text-xs text-[rgba(248,250,252,0.6)]">
                                  Showing {MENU_COLLECTIONS_CAP} of {collectionLinks.length}
                                </li>
                              )}
                              <li>
                                <NavLink
                                  href="/sitemap"
                                  onClick={close}
                                  className="text-sm font-medium leading-6 text-[var(--brand-secondary)] hover:text-[var(--brand-accent)]"
                                  data-testid="nav-menu-sitemap-link"
                                >
                                  Site map (all pages &amp; collections)
                                </NavLink>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-y-6 border-t border-[var(--brand-accent)]/20 pt-4">
                      <div
                        className="flex justify-between text-[var(--brand-secondary)]"
                        onMouseEnter={toggleState.open}
                        onMouseLeave={toggleState.close}
                      >
                        {regions && (
                          <CountrySelect
                            toggleState={toggleState}
                            regions={regions}
                          />
                        )}
                        <ArrowRightMini
                          className={clx(
                            "transition-transform duration-150",
                            toggleState.state ? "-rotate-90" : ""
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </Popover.Panel>
              </Transition>
            </>
          )}
        </Popover>
      </div>
    </div>
  )
}

export default SideMenu
