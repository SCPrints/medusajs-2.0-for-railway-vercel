"use client"

import { PricingBreakdown, SizeQuantity } from "@modules/customizer/lib/types"

type PricingPanelProps = {
  currencyCode: string
  pricing: PricingBreakdown
  sizes: SizeQuantity[]
  onChangeSizeQty: (size: string, quantity: number) => void
  onAddToCart: () => Promise<void>
  isSubmitting: boolean
  /** PDP embed: single size row, shorter copy. */
  embeddedOnPdp?: boolean
}

const formatMoney = (amountCents: number, currencyCode: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amountCents / 100)

export default function PricingPanel({
  currencyCode,
  pricing,
  sizes,
  onChangeSizeQty,
  onAddToCart,
  isSubmitting,
  embeddedOnPdp = false,
}: PricingPanelProps) {
  const quantity = sizes.reduce((total, entry) => total + entry.quantity, 0)

  return (
    <div className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
      {!embeddedOnPdp ? (
        <>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ui-fg-base">
              Size & quantity
            </h3>
            <p className="mt-1 text-xs text-ui-fg-subtle">
              Set quantities per size. Totals update with print locations and volume.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-ui-fg-subtle">Sizes</label>
            <div className="grid grid-cols-2 gap-2">
              {sizes.map((sizeEntry) => (
                <label
                  key={sizeEntry.size}
                  className="flex items-center gap-2 rounded-md border border-ui-border-base px-2 py-1.5"
                >
                  <span className="w-9 text-xs font-medium">{sizeEntry.size}</span>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={sizeEntry.quantity}
                    onChange={(event) =>
                      onChangeSizeQty(sizeEntry.size, Number(event.target.value))
                    }
                    className="w-full rounded-md border border-ui-border-base px-2 py-1 text-sm"
                  />
                </label>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <details className="group rounded-lg border border-ui-border-base bg-ui-bg-subtle/50">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-ui-fg-base marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Price breakdown
            <span className="text-ui-fg-subtle transition group-open:rotate-180">▼</span>
          </span>
        </summary>
        <div className="space-y-1 border-t border-ui-border-base px-3 pb-3 pt-2 text-xs">
        <p className="flex justify-between">
          <span>Base unit</span>
          <span>{formatMoney(pricing.baseUnitPriceCents, currencyCode)}</span>
        </p>
        <p className="flex justify-between">
          <span>Print location surcharge / unit</span>
          <span>{formatMoney(pricing.sideSurchargePerUnitCents, currencyCode)}</span>
        </p>
        <p className="flex justify-between">
          <span>Discount</span>
          <span>{Math.round(pricing.quantityDiscountRate * 100)}%</span>
        </p>
        <p className="flex justify-between font-medium">
          <span>Unit after discount</span>
          <span>{formatMoney(pricing.discountedUnitPriceCents, currencyCode)}</span>
        </p>
        <p className="flex justify-between font-semibold text-sm">
          <span>Total ({quantity})</span>
          <span>{formatMoney(pricing.totalPriceCents, currencyCode)}</span>
        </p>
        </div>
      </details>

      <button
        type="button"
        onClick={onAddToCart}
        disabled={isSubmitting || quantity <= 0}
        className="w-full rounded-xl bg-ui-fg-base px-4 py-3.5 text-base font-semibold text-ui-bg-base shadow-sm transition hover:opacity-95 disabled:opacity-50"
      >
        {isSubmitting ? "Adding..." : "Add to cart"}
      </button>
    </div>
  )
}
