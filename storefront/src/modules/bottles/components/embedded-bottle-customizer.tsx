"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import type { HttpTypes } from "@medusajs/types"

import type { BottleSpec } from "../lib/bottle-label-spec"

// The shared product template references this component, so a static import put
// Fabric (~110 KB gzipped) on every product page. Still server-rendered for bottles.
const BottleCustomizer = dynamic(() => import("./bottle-customizer"))

type VariantOption = {
  id: string
  title: string
  sku?: string | null
  isInStock: boolean
}

type Props = {
  product: HttpTypes.StoreProduct
  countryCode: string
  bottleSpec: BottleSpec
  variantOptions: VariantOption[]
  initialVariantId: string | null
}

export default function EmbeddedBottleCustomizer({
  product,
  countryCode,
  bottleSpec,
  variantOptions,
  initialVariantId,
}: Props) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariantId
  )

  return (
    <div className="flex flex-col gap-6">
      {variantOptions.length > 1 ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-ui-fg-subtle">
            Bottle option
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {variantOptions.map((opt) => {
              const active = opt.id === selectedVariantId
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!opt.isInStock}
                  onClick={() => setSelectedVariantId(opt.id)}
                  className={
                    "rounded-full border px-4 py-1.5 text-sm transition " +
                    (active
                      ? "border-(--brand-primary) bg-(--brand-primary) text-white"
                      : "border-ui-border-base hover:bg-ui-bg-subtle disabled:opacity-50")
                  }
                  title={opt.isInStock ? undefined : "Out of stock"}
                >
                  {opt.title}
                  {!opt.isInStock ? " · out" : ""}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <BottleCustomizer
        product={product}
        countryCode={countryCode}
        bottleSpec={bottleSpec}
        selectedVariantId={selectedVariantId}
      />
    </div>
  )
}
