"use client"

import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * URL params that signal "the customer arrived to design/edit, not browse" —
 * kept in sync with `PdpSplitTabs`'s `startsOnDesign` set. On the PDP studio
 * these MUST auto-open the overlay so the canvas mounts and its rehydration
 * effect can replay the cart line / saved design / order artwork. `?edit_group=`
 * in particular is a real cart-edit deep link to `/products/<handle>` — without
 * the auto-open the customer is stranded on the photo landing with nothing to
 * hydrate.
 */
const DEEP_LINK_PARAMS = ["edit_group", "edit", "design", "reorder", "adminProof", "quote_id", "pos_session"] as const

type Props = {
  /** Garment title, shown beside the photos and in the studio top bar. */
  title: string
  /**
   * Open the studio immediately on load (re-order / saved-design deep links,
   * which carry artwork to replay). Server-computed so it's available at
   * hydration — avoids the `useSearchParams()`-null-during-prerender trap.
   * On the PDP this is usually left unset; the component also auto-opens for
   * any {@link DEEP_LINK_PARAMS} it sees in the URL client-side.
   */
  autoOpen?: boolean
  /** Server-rendered photo gallery (the landing "photos" view). */
  gallery: ReactNode
  /** Optional colour swatches shown on the landing; switching colour swaps the gallery photos. */
  colourSelector?: ReactNode
  /** Optional cart button (count + dropdown) shown in the studio top bar. */
  cartButton?: ReactNode
  /** Optional product description / spec tabs shown below the landing. */
  productInfo?: ReactNode
  /**
   * The full Assembly customizer (already wrapped in AssemblyLayoutGrid).
   * Only mounted once the studio is opened so the heavy Fabric canvas doesn't
   * spin up behind the landing.
   */
  studio: ReactNode
  /**
   * Optional marketing/spec content rendered below the landing hero (production
   * ETA, decoration estimator, spec tabs). Lives inside the landing's inert
   * scope so it's removed from the a11y/tab order while the studio is open, and
   * is server-rendered into the DOM so crawlers index the full PDP content even
   * though the design surface is a deferred overlay.
   */
  belowFold?: ReactNode
}

/**
 * `/customizer-v2` shell. Lands on a photo-first product view (like the normal
 * PDP) and, when the customer hits "Customise this garment", opens the design
 * studio as a full-viewport overlay that covers the site header/footer — the
 * studio takes centre stage. The page itself never scrolls while the studio is
 * open (body scroll is locked); the only scroll is inside the studio's
 * right-hand section panel. SC Prints branding stays top-left in black.
 */
export default function StudioLauncher({ title, autoOpen = false, gallery, colourSelector, cartButton, productInfo, studio, belowFold }: Props) {
  const searchParams = useSearchParams()
  const deepLinkOpen = DEEP_LINK_PARAMS.some((p) => !!searchParams?.get(p))
  const [open, setOpen] = useState(false)
  // Once the studio has been opened, keep it MOUNTED (just hidden when closed)
  // so "Back to photos" / Escape never unmount the canvas and silently discard
  // the in-progress design — reopening restores the exact same design. Stays
  // lazy until the first open so the heavy Fabric canvas doesn't spin up behind
  // the landing.
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false)
  // Product-details drawer (description / tags), so the marketing copy that's
  // on the landing is still reachable once the full-screen studio covers it.
  const [showDetails, setShowDetails] = useState(false)

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const landingRef = useRef<HTMLDivElement | null>(null)

  const openStudio = () => {
    setHasOpenedOnce(true)
    setOpen(true)
  }

  const closeStudio = () => {
    setShowDetails(false)
    setOpen(false)
  }

  // Re-order / saved-design deep links: open the studio on first paint so the
  // canvas mounts and the rehydration effect replays the saved artwork, instead
  // of stranding the customer on the photo landing.
  useEffect(() => {
    if (autoOpen || deepLinkOpen) openStudio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Accessibility: while the studio overlay is open, make the page behind it
  // inert (removed from tab order + the a11y tree), move focus into the
  // overlay, trap Tab within it, and restore focus to the trigger on close.
  // The site header/footer + landing all sit behind the fixed overlay and would
  // otherwise be reachable by keyboard / screen reader.
  useEffect(() => {
    if (!open) {
      if (landingRef.current) landingRef.current.inert = false
      return
    }
    const overlay = overlayRef.current
    if (landingRef.current) landingRef.current.inert = true

    const focusables = () =>
      overlay
        ? Array.from(
            overlay.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null)
        : []

    const focusTimer = setTimeout(() => focusables()[0]?.focus(), 60)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !overlay) return
      // A sub-layer (bulk grid, colour picker, help guide) manages its own focus.
      if (document.querySelector("[data-studio-sublayer]")) return
      if (document.querySelector('[aria-label^="Customizer guide"]')) return
      const f = focusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    overlay?.addEventListener("keydown", onKey)

    return () => {
      clearTimeout(focusTimer)
      overlay?.removeEventListener("keydown", onKey)
      if (landingRef.current) landingRef.current.inert = false
      triggerRef.current?.focus()
    }
  }, [open])

  // Close the details drawer on Escape (without closing the whole studio).
  useEffect(() => {
    if (!showDetails) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopImmediatePropagation()
      setShowDetails(false)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [showDetails])

  // Lock all page scroll (html + body) + wire Escape-to-close while the studio
  // overlay is open, so the customer can never accidentally scroll the page
  // behind the studio. Scroll position is preserved and restored on close.
  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const { body } = document
    const scrollY = window.scrollY
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
    }
    html.style.overflow = "hidden"
    body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // Don't tear the customer out of the studio when a sub-layer is open
      // (the bulk-colour grid, a colour picker, the help guide). Escape should
      // dismiss THAT layer, not the whole studio + their design. Sub-layers tag
      // themselves with data-studio-sublayer; the guide stops Escape itself via
      // a capture-phase listener.
      if (document.querySelector("[data-studio-sublayer]")) return
      setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      window.removeEventListener("keydown", onKey)
      window.scrollTo(0, scrollY)
    }
  }, [open])

  return (
    <>
      {/* Landing — everything behind the studio overlay. Wrapped in one ref so
          the whole PDP (hero + below-fold marketing) goes inert together while
          the studio is open. */}
      <div ref={landingRef}>
      {/* Hero — text (title, CTA, details) on the left of the picture. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Text column — sits to the left of the photo on desktop, below it on
            mobile (image-first). */}
        <div className="order-2 flex flex-col gap-5 lg:order-none lg:col-span-5">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold leading-tight text-ui-fg-base lg:text-3xl">
              {title}
            </h1>
            <button
              ref={triggerRef}
              type="button"
              onClick={openStudio}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--brand-primary,#1e293b)] px-4 py-4 text-base font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-black/5 transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary,#1e293b)] focus-visible:ring-offset-2"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
              Customise this garment
              <span aria-hidden className="text-lg leading-none">→</span>
            </button>
            <p className="text-center text-[11px] text-ui-fg-subtle">
              Opens the full-screen design studio · upload artwork or add text
            </p>
          </div>
          {colourSelector ? (
            <div className="border-t border-ui-border-base pt-5">{colourSelector}</div>
          ) : null}
          {productInfo ? (
            <div className="border-t border-ui-border-base pt-5">{productInfo}</div>
          ) : null}
        </div>

        {/* Picture — to the right of the text on desktop, first on mobile. */}
        <div className="order-1 lg:order-none lg:col-span-7">{gallery}</div>
      </div>

      {/* Below-fold marketing/spec content (production ETA, decoration
          estimator, spec tabs). Server-rendered so it's indexable, and inert
          with the rest of the landing while the studio is open. */}
      {belowFold ? <div className="mt-12">{belowFold}</div> : null}
      </div>

      {/* Full-screen studio overlay — fixed over the entire viewport, above the
          site header/footer. Mounted once opened, then toggled via display so
          closing never unmounts the canvas (the design survives reopen). */}
      {hasOpenedOnce ? (
        <div
          ref={overlayRef}
          className={`fixed inset-0 z-[200] flex-col bg-ui-bg-subtle ${open ? "flex" : "hidden"}`}
          role="dialog"
          aria-modal="true"
          aria-hidden={!open}
          aria-label={`Customise ${title}`}
        >
          {/* Studio top bar — black SC Prints wordmark left, close right. */}
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ui-border-base bg-ui-bg-base px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Image
                src="/branding/sc-prints-logo-transparent.png"
                alt="SC Prints"
                width={158}
                height={52}
                className="h-8 w-auto"
                priority
              />
              <span className="hidden truncate text-sm text-ui-fg-subtle small:inline">
                {title}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 small:gap-3">
              <button
                type="button"
                onClick={closeStudio}
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-ui-border-base px-3.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
              >
                <span aria-hidden className="text-base leading-none">←</span>
                <span className="hidden phone:inline">Back to photos</span>
                <span className="phone:hidden">Photos</span>
              </button>
              {productInfo ? (
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="inline-flex h-11 items-center gap-1.5 rounded-full border border-ui-border-base px-3.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <span className="hidden phone:inline">Details</span>
                </button>
              ) : null}
              {cartButton ? (
                <div className="flex items-center text-ui-fg-base">{cartButton}</div>
              ) : null}
            </div>
          </div>

          {/* Studio body — fills the rest; the only scroll lives inside the
              right-hand section panel within `studio`. */}
          <div className="min-h-0 flex-1">{studio}</div>

          {/* Product-details drawer — surfaces the description / spec tabs that
              live on the landing, so they're still reachable in the studio.
              Tagged as a sub-layer so Escape dismisses it (not the studio). */}
          {showDetails && productInfo ? (
            <div className="absolute inset-0 z-[60] flex justify-end" data-studio-sublayer>
              <button
                type="button"
                aria-label="Close product details"
                onClick={() => setShowDetails(false)}
                className="absolute inset-0 cursor-default bg-black/40"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Product details"
                className="relative flex h-full w-full max-w-md flex-col bg-ui-bg-base shadow-xl"
              >
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-ui-border-base px-4">
                  <p className="text-sm font-semibold text-ui-fg-base">Product details</p>
                  <button
                    type="button"
                    onClick={() => setShowDetails(false)}
                    aria-label="Close"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ui-fg-subtle transition-colors hover:bg-ui-bg-subtle hover:text-ui-fg-base"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{productInfo}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
