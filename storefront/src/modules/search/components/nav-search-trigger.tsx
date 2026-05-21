"use client"

import { MagnifyingGlassMini } from "@medusajs/icons"
import { useCallback, useState } from "react"

import SearchOverlay from "./search-overlay"

/**
 * The magnifying-glass button in the global nav.
 *
 * Why this isn't a `<LocalizedClientLink href="/search">`: routing to a
 * separate `/search` page worked, but closing the modal forced a router
 * back-nav onto the previous page, which Next.js re-renders and re-hydrates.
 * On a heavy PLP (categories/mens with the refinement list + paginated
 * products) that hydration takes 3-4 seconds, during which `LocalizedClientLink`
 * click handlers aren't attached yet — so the page looked fine but links
 * didn't respond. State-toggled rendering keeps the underlying page mounted,
 * hydrated, and interactive throughout.
 *
 * The `/<cc>/search` route still exists as a deep-link backstop (renders the
 * same overlay always-open via the route's page component) so bookmarked or
 * shared search URLs continue to work.
 */
export default function NavSearchTrigger() {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-full min-h-10 min-w-10 items-center justify-center hover:text-[var(--brand-accent)]"
        data-testid="nav-search-link"
        aria-label="Search site"
      >
        <MagnifyingGlassMini
          className="block size-6 shrink-0 translate-y-1.5 text-[currentColor]"
          aria-hidden
        />
      </button>
      <SearchOverlay open={open} onClose={close} />
    </>
  )
}
