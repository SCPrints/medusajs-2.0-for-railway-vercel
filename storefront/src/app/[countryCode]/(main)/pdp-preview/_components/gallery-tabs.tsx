"use client"

import type { HttpTypes } from "@medusajs/types"
import { LayoutGroup, motion, useReducedMotion } from "framer-motion"
import { useId, useState, type ReactNode } from "react"
import {
  ProductInfoTab,
  ShippingInfoTab,
} from "@modules/products/components/product-tabs"

type Props = {
  product: HttpTypes.StoreProduct
  gallery: ReactNode
}

const TAB_LABELS = ["Photos", "Specifications", "Shipping & Returns"] as const

/**
 * Variant D preview only: a 3-tab strip that puts the gallery alongside
 * the existing Specifications + Shipping & Returns tabs. Mirrors the
 * styling of @modules/products/components/product-tabs so the look is
 * consistent with the rest of the PDP.
 */
export default function GalleryTabs({ product, gallery }: Props) {
  const [active, setActive] = useState(0)
  const reducedMotion = useReducedMotion()
  const baseId = useId()

  const underlineTransition = reducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34 }

  return (
    <div className="w-full">
      <LayoutGroup id={`${baseId}-pdp-preview-tabs`}>
        <div
          className="relative flex gap-1 border-b border-ui-border-base"
          role="tablist"
          aria-label="Product information"
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
              className="relative z-[1] px-3 py-2 pb-3 text-left text-sm font-medium text-ui-fg-muted transition-colors data-[active=true]:text-ui-fg-base small:px-4"
              data-active={active === i}
              onClick={() => setActive(i)}
            >
              {label}
              {active === i ? (
                <motion.span
                  layoutId={`${baseId}-pdp-preview-tab-underline`}
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-ui-fg-base"
                  transition={underlineTransition}
                />
              ) : null}
            </button>
          ))}
        </div>
      </LayoutGroup>

      <div
        role="tabpanel"
        id={`${baseId}-panel-0`}
        aria-labelledby={`${baseId}-tab-0`}
        hidden={active !== 0}
      >
        <div className="py-6">{gallery}</div>
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-1`}
        aria-labelledby={`${baseId}-tab-1`}
        hidden={active !== 1}
      >
        <ProductInfoTab product={product} />
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-2`}
        aria-labelledby={`${baseId}-tab-2`}
        hidden={active !== 2}
      >
        <ShippingInfoTab product={product} />
      </div>
    </div>
  )
}
