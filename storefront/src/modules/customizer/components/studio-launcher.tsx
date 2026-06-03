"use client"

import Image from "next/image"
import { useEffect, useState, type ReactNode } from "react"

type Props = {
  /** Garment title, shown beside the photos and in the studio top bar. */
  title: string
  /** Server-rendered photo gallery (the landing "photos" view). */
  gallery: ReactNode
  /** Optional colour swatches shown on the landing; switching colour swaps the gallery photos. */
  colourSelector?: ReactNode
  /** Optional product description / spec tabs shown below the landing. */
  productInfo?: ReactNode
  /**
   * The full Assembly customizer (already wrapped in AssemblyLayoutGrid).
   * Only mounted once the studio is opened so the heavy Fabric canvas doesn't
   * spin up behind the landing.
   */
  studio: ReactNode
}

/**
 * `/customizer-v2` shell. Lands on a photo-first product view (like the normal
 * PDP) and, when the customer hits "Customise this garment", opens the design
 * studio as a full-viewport overlay that covers the site header/footer — the
 * studio takes centre stage. The page itself never scrolls while the studio is
 * open (body scroll is locked); the only scroll is inside the studio's
 * right-hand section panel. SC Prints branding stays top-left in black.
 */
export default function StudioLauncher({ title, gallery, colourSelector, productInfo, studio }: Props) {
  const [open, setOpen] = useState(false)

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
      if (e.key === "Escape") setOpen(false)
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
      {/* Landing — text (title, CTA, details) on the left of the picture. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Text column — sits to the left of the photo on desktop, below it on
            mobile (image-first). */}
        <div className="order-2 flex flex-col gap-5 lg:order-none lg:col-span-5">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold leading-tight text-ui-fg-base lg:text-3xl">
              {title}
            </h1>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--brand-primary,#e11d48)] px-4 py-4 text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-rose-500/30 ring-1 ring-rose-400/40 transition-transform hover:bg-[var(--brand-primary-hover,#be123c)] hover:scale-[1.01] active:scale-[0.99]"
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

      {/* Full-screen studio overlay — fixed over the entire viewport, above the
          site header/footer. */}
      {open ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-ui-bg-subtle"
          role="dialog"
          aria-modal="true"
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
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ui-border-base px-3.5 text-sm font-medium text-ui-fg-base transition-colors hover:bg-ui-bg-subtle"
            >
              <span aria-hidden className="text-base leading-none">←</span>
              Back to photos
            </button>
          </div>

          {/* Studio body — fills the rest; the only scroll lives inside the
              right-hand section panel within `studio`. */}
          <div className="min-h-0 flex-1">{studio}</div>
        </div>
      ) : null}
    </>
  )
}
