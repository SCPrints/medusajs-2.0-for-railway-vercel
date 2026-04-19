"use client"

import { Popover, Transition } from "@headlessui/react"
import { ArrowRightMini, XMark } from "@medusajs/icons"
import { clx, useToggleState } from "@medusajs/ui"
import { Fragment } from "react"
import NavLink from "@modules/common/components/nav-link"
import CountrySelect from "../country-select"
import { HttpTypes } from "@medusajs/types"

const SideMenuItems = {
  Home: "/",
  Store: "/store",
  Customizer: "/customizer",
  Services: "/services",
  Brands: "/brands",
  "Contact Us": "/contact",
  Search: "/search",
  Account: "/account",
  Cart: "/cart",
}

const MegaMenuGroups: Array<{
  title: string
  items: Array<{ label: string; href: string }>
}> = [
  {
    title: "Mens / Womens / Kids",
    items: [
      { label: "Mens", href: "/store" },
      { label: "Womens", href: "/store" },
      { label: "Kids", href: "/store" },
    ],
  },
  {
    title: "Workwear / Uniforms",
    items: [
      { label: "Workwear", href: "/store" },
      { label: "Corporate Uniforms", href: "/store" },
    ],
  },
  {
    title: "Services",
    items: [
      { label: "Screen Printing", href: "/services/screen-printing" },
      { label: "Embroidery", href: "/services/embroidery" },
      { label: "Digital Transfers", href: "/services/digital-transfers" },
      { label: "UV Printing", href: "/services/uv-printing" },
    ],
  },
  {
    title: "Industries",
    items: [
      { label: "Hospitality", href: "/store" },
      { label: "Trades", href: "/store" },
      { label: "Schools & Clubs", href: "/store" },
    ],
  },
]

const SideMenu = ({ regions }: { regions: HttpTypes.StoreRegion[] | null }) => {
  const toggleState = useToggleState()

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        <Popover className="h-full flex">
          {({ open, close }) => (
            <>
              <div className="relative flex h-full">
                <Popover.Button
                  data-testid="nav-menu-button"
                  className="relative h-full flex items-center text-[var(--brand-secondary)] transition-all ease-out duration-200 focus:outline-none hover:text-[var(--brand-accent)]"
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
                <Popover.Panel className="flex flex-col absolute w-full pr-4 sm:pr-0 sm:w-[560px] h-[calc(100vh-1rem)] z-30 inset-x-0 text-sm text-[#F8FAFC] m-2 backdrop-blur-2xl">
                  <div
                    data-testid="nav-menu-popup"
                    className="flex flex-col h-full bg-[rgba(12,17,23,0.82)] rounded-rounded justify-between p-6"
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
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                      <ul className="flex flex-col gap-5 items-start justify-start">
                        {Object.entries(SideMenuItems).map(([name, href]) => {
                          return (
                            <li key={name}>
                              <NavLink
                                href={href}
                                onClick={close}
                                className="text-3xl leading-10 text-[rgba(248,250,252,0.96)] hover:text-[var(--brand-secondary)]"
                                data-testid={`${name.toLowerCase()}-link`}
                              >
                                {name}
                              </NavLink>
                            </li>
                          )
                        })}
                      </ul>

                      <div className="mt-8 border-t border-[rgba(0,173,181,0.35)] pt-6">
                        <p className="mb-4 txt-compact-small uppercase tracking-[0.12em] text-[var(--brand-accent)]">
                          Browse Products & Services
                        </p>
                        <div className="grid gap-6 sm:grid-cols-2">
                          {MegaMenuGroups.map((group) => (
                            <div key={group.title}>
                              <p className="mb-2 txt-compact-small text-[var(--brand-accent)]">
                                {group.title}
                              </p>
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
                    </div>
                    <div className="flex flex-col gap-y-6">
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