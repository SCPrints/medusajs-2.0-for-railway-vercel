"use client"

import { PricingBreakdown, SizeQuantity } from "@modules/customizer/lib/types"

type PricingPanelProps = {
  currencyCode: string
  pricing: PricingBreakdown
  sizes: SizeQuantity[]
  onChangeSizeQty: (size: string, quantity: number) => void
  onAddToCart: () => Promise<void>
  isSubmitting: boolean
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
}: PricingPanelProps) {
  const quantity = sizes.reduce((total, entry) => total + entry.quantity, 0)

  return (
    <div className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
      <div>
        <h3 className="text-sm font-semibold text-ui-fg-base">Commerce Engine</h3>
        <p className="mt-1 text-xs text-ui-fg-subtle">Pricing auto-updates with side count and quantity tiers.</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-ui-fg-subtle">Size matrix</label>
        <div className="grid grid-cols-2 gap-2">
          {sizes.map((sizeEntry) => (
            <label key={sizeEntry.size} className="flex items-center gap-2 rounded-md border border-ui-border-base px-2 py-1.5">
              <span className="w-9 text-xs font-medium">{sizeEntry.size}</span>
              <input
                type="number"
                min={0}
                max={999}
                value={sizeEntry.quantity}
                onChange={(event) => onChangeSizeQty(sizeEntry.size, Number(event.target.value))}
                className="w-full rounded-md border border-ui-border-base px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1 rounded-md bg-ui-bg-subtle p-3 text-xs">
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

      <button
        type="button"
        onClick={onAddToCart}
        disabled={isSubmitting || quantity <= 0}
        className="w-full rounded-md bg-ui-fg-base px-3 py-2 text-sm text-ui-bg-base disabled:opacity-50"
      >
        {isSubmitting ? "Adding..." : "Add Custom Design to Cart"}
      </button>
    </div>
  )
}
