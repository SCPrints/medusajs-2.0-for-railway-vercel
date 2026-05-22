"use client"

import { LayoutGroup, motion, useReducedMotion } from "framer-motion"
import { useId, useState, type ReactNode } from "react"

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
 */
export default function PdpSplitTabs({
  gallery,
  variantPickers,
  designContent,
}: Props) {
  const [active, setActive] = useState<0 | 1>(0)
  const [designMounted, setDesignMounted] = useState(false)
  const reducedMotion = useReducedMotion()
  const baseId = useId()

  const underlineTransition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34 }

  const goDesign = () => {
    setDesignMounted(true)
    setActive(1)
  }

  return (
    <div className="w-full">
      <LayoutGroup id={`${baseId}-pdp-split-tabs`}>
        <div
          className="relative mb-6 flex gap-1 border-b border-ui-border-base"
          role="tablist"
          aria-label="Product view"
        >
          {TAB_LABELS.map((label, i) => (
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
                  goDesign()
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
          ))}
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
            <div className="space-y-1 border-b border-ui-border-base pb-3">
              <p className="text-xl font-semibold text-ui-fg-base">
                Pick your colour
              </p>
              <p className="text-xs text-ui-fg-subtle">
                Tap "Customise this garment" when you're ready to design.
              </p>
            </div>
            <div className="space-y-3 rounded-xl border border-ui-border-base bg-ui-bg-base p-4 shadow-sm">
              {variantPickers}
              <button
                type="button"
                onClick={goDesign}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--brand-primary,#e11d48)] px-4 py-4 text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-rose-500/30 ring-1 ring-rose-400/40 transition-transform hover:scale-[1.01] hover:bg-[var(--brand-primary-hover,#be123c)] active:scale-[0.99]"
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
