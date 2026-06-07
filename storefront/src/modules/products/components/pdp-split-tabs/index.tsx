"use client"

import { LayoutGroup, motion, useReducedMotion } from "framer-motion"
import { useSearchParams } from "next/navigation"
import { useId, useState, type KeyboardEvent, type ReactNode } from "react"

type Props = {
  /** Hero + thumbnails gallery (ImageGallery in heroLayout mode). */
  gallery: ReactNode
  /** ProductActions colour/size pickers shared with the customizer wizard. */
  variantPickers: ReactNode
  /** The full customizer (PdpLayoutGrid + EmbeddedProductCustomizer).
   *  Lazily mounted on first switch to the Customise tab so Fabric.js's
   *  canvas initialises with real dimensions instead of 0×0. Once mounted
   *  it stays mounted (hidden via display:none) so design state survives
   *  subsequent tab swaps. */
  designContent: ReactNode
}

const TAB_LABELS = ["Photos", "Customise this garment"] as const

/**
 * Top-level PDP tab strip: Photos | Customise this garment.
 *
 * Photos is the default view — gallery on the left, colour picker +
 * "Customise this garment" CTA on the right. Clicking the CTA (or the
 * Customise tab) flips the same slot to the design surface (canvas +
 * wizard). The colour selection survives the swap because both panels
 * read from the same ProductOptionsContext.
 *
 * Exception — edit-from-cart flow: landing on the PDP with
 * `?edit_group=<id>`, `?edit=<line_id>`, `?design=<id>`, or
 * `?reorder=<order_id:line_id>` means the customer's intent is to edit
 * artwork, not browse photos. In that case the Customise tab is the
 * default AND we eager-mount the design content so the customizer can
 * hydrate from the cart/design/order metadata on first render. Without
 * this the customer lands on Photos and the design hydration never
 * fires until they manually click the tab.
 */
export default function PdpSplitTabs({
  gallery,
  variantPickers,
  designContent,
}: Props) {
  const searchParams = useSearchParams()
  const startsOnDesign =
    !!searchParams?.get("edit_group") ||
    !!searchParams?.get("edit") ||
    !!searchParams?.get("design") ||
    !!searchParams?.get("reorder") ||
    !!searchParams?.get("adminProof")
  const [active, setActive] = useState<0 | 1>(startsOnDesign ? 1 : 0)
  const [designMounted, setDesignMounted] = useState(startsOnDesign)
  const reducedMotion = useReducedMotion()
  const baseId = useId()

  const underlineTransition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34 }

  // `fromCta=true` signals that the customer just committed Step 1
  // (i.e. clicked the rose "Customise this garment" CTA on the Photos
  // panel). The embedded customizer reads this flag on mount and
  // auto-advances its wizard to Step 2 so the customer doesn't have to
  // click the same CTA a second time inside the wizard. Tab clicks
  // pass `fromCta=false` — just a navigation, not a commit.
  const goDesign = (fromCta = false) => {
    if (fromCta && typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("sc:pdp-photos-cta-fired", "1")
      } catch {
        // sessionStorage may throw in private mode — non-fatal.
      }
    }
    setDesignMounted(true)
    setActive(1)
  }

  /** "Need help?" trigger from the Photos tab. Switches to Customise and
   *  signals the wizard's CustomizerGuide to auto-open on mount so the
   *  customer doesn't have to find the button again. The guide overlay
   *  targets wizard step DOM nodes, so it can only live inside the
   *  customizer — but the discoverability of the help action belongs on
   *  the first screen the customer sees. */
  const openGuideFromPhotos = () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("sc:open-guide-on-mount", "1")
      } catch {
        /* sessionStorage may throw in private mode — non-fatal. */
      }
    }
    goDesign(false)
  }

  // WAI-ARIA tablist keyboard nav: arrow / Home / End move between tabs. Only
  // meaningful once the Customise tab is revealed (designMounted) — before that
  // there is a single tab.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!designMounted) return
    let target: 0 | 1 | null = null
    if (e.key === "ArrowRight" || e.key === "End") target = 1
    else if (e.key === "ArrowLeft" || e.key === "Home") target = 0
    if (target === null) return
    e.preventDefault()
    if (target === 1) goDesign(false)
    else setActive(0)
    if (typeof document !== "undefined") {
      document.getElementById(`${baseId}-tab-${target}`)?.focus()
    }
  }

  return (
    <div className="w-full">
      <LayoutGroup id={`${baseId}-pdp-split-tabs`}>
        <div
          className="relative mb-6 flex gap-1 border-b border-ui-border-base"
          role="tablist"
          aria-label="Product view"
          onKeyDown={onTablistKeyDown}
        >
          {TAB_LABELS.map((label, i) => {
            // Hide the Customise tab until the customer engages the
            // rose CTA (or arrives via an edit/reorder URL). The tab
            // duplicates the CTA otherwise and confuses customers who
            // haven't picked a colour yet.
            if (i === 1 && !designMounted) {
              return null
            }
            return (
              <button
                key={label}
                type="button"
                role="tab"
                id={`${baseId}-tab-${i}`}
                aria-selected={active === i}
                aria-controls={`${baseId}-panel-${i}`}
                tabIndex={active === i ? 0 : -1}
                className="relative z-[1] min-h-11 px-4 py-2.5 pb-3 text-left text-sm font-medium text-ui-fg-muted transition-colors data-[active=true]:text-ui-fg-base small:px-5"
                data-active={active === i}
                onClick={() => {
                  if (i === 1) {
                    goDesign(false)
                  } else {
                    setActive(0)
                  }
                }}
              >
                {label}
                {active === i ? (
                  <motion.span
                    layoutId={`${baseId}-pdp-split-tab-underline`}
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-ui-fg-base"
                    transition={underlineTransition}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </LayoutGroup>

      {/* Photos tab */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-0`}
        aria-labelledby={`${baseId}-tab-0`}
        hidden={active !== 0}
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base p-4 shadow-sm">
              {gallery}
            </div>
          </div>
          <div className="flex flex-col gap-4 lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-start justify-between gap-3 border-b border-ui-border-base pb-3">
              <div className="space-y-1">
                <p className="text-xl font-semibold text-ui-fg-base">
                  Pick your colour
                </p>
                <p className="text-xs text-ui-fg-subtle">
                  Tap "Customise this garment" when you're ready to design.
                </p>
              </div>
              <button
                type="button"
                onClick={openGuideFromPhotos}
                aria-label="Open the step-by-step guide"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--brand-secondary)] bg-[var(--brand-secondary)] px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)] focus-visible:ring-offset-2 whitespace-nowrap"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden
                  className="shrink-0"
                >
                  <circle cx="6" cy="6" r="5.4" stroke="currentColor" strokeWidth="1.2" />
                  <path
                    d="M5.1 4.6C5.1 4.1 5.5 3.7 6 3.7s.9.4.9.9c0 .4-.2.7-.6.9L6 5.8v.7"
                    stroke="currentColor"
                    strokeWidth="1.1"
                    strokeLinecap="round"
                  />
                  <circle cx="6" cy="7.9" r=".5" fill="currentColor" />
                </svg>
                Need help?
              </button>
            </div>
            <div className="space-y-3 rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-sm">
              {variantPickers}
              <button
                type="button"
                onClick={() => goDesign(true)}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--brand-primary,#1e293b)] px-4 py-4 text-base font-bold uppercase tracking-wide text-white shadow-md ring-1 ring-black/5 transition-all hover:scale-[1.01] hover:brightness-110 active:scale-[0.99]"
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
                <span aria-hidden className="text-lg leading-none">
                  →
                </span>
              </button>
              <p className="text-center text-[11px] text-ui-fg-subtle">
                Free design tool · upload artwork or add text
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Customise tab — lazy mounted on first open so Fabric.js's
          canvas initialises with real dimensions. */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-1`}
        aria-labelledby={`${baseId}-tab-1`}
        hidden={active !== 1}
      >
        {designMounted ? designContent : null}
      </div>
    </div>
  )
}
