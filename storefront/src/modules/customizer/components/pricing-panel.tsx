"use client"

import { useMemo, useState } from "react"

import { convertToLocale } from "@lib/util/money"
import FlyToCartAddButton from "@modules/common/components/fly-to-cart-add-button"
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
  /** When set, Add to cart uses the PDP fly + squish interaction (see fly-to-cart-add-button). */
  flyImageSrc?: string
  /**
   * DTF reference estimator (separate from checkout math). Set via product metadata
   * `show_dtf_tier_estimator: true` in Admin when you want this block visible.
   */
  showDtfTierEstimator?: boolean
  /** Shown with `embeddedOnPdp` as the step index before "Quantity & checkout" (2 or 3). */
  embedPdpQuantityStepNumber?: number
}

type DtfQuantityTier = {
  label: string
  minQuantity: number
  maxQuantity?: number
}

type DtfPrintAreaOption = {
  id: string
  label: string
  pricesByTierCents: number[]
}

const DTF_QUANTITY_TIERS: DtfQuantityTier[] = [
  { label: "Qty 1-9", minQuantity: 1, maxQuantity: 9 },
  { label: "Qty 10-49", minQuantity: 10, maxQuantity: 49 },
  { label: "Qty 50-99", minQuantity: 50, maxQuantity: 99 },
  { label: "Qty 100+", minQuantity: 100 },
]

// DTF reference prices in major units (AUD dollars), to match `price.amount` scale.
const DTF_PRINT_AREA_OPTIONS: DtfPrintAreaOption[] = [
  { id: "left_chest", label: "Left Chest (Up to A6)", pricesByTierCents: [8.5, 6.5, 5.5, 5] },
  { id: "standard", label: "Standard Print (Up to A3)", pricesByTierCents: [12.5, 9.5, 8.5, 8] },
  { id: "oversize", label: "Oversize Print", pricesByTierCents: [15, 12.5, 11.5, 11] },
]

const formatMoney = (amount: number, currencyCode: string) =>
  convertToLocale({ amount, currency_code: currencyCode })

const formatTierRange = (minQuantity: number, maxQuantity?: number) =>
  typeof maxQuantity === "number" ? `${minQuantity}-${maxQuantity}` : `${minQuantity}+`

const resolveDtfQuantityTierIndex = (quantity: number) =>
  DTF_QUANTITY_TIERS.findIndex((tier) => {
    if (quantity < tier.minQuantity) {
      return false
    }
    if (typeof tier.maxQuantity === "number" && quantity > tier.maxQuantity) {
      return false
    }
    return true
  })

const ExpandCollapsePlus = () => (
  <span className="relative h-5 w-5">
    <span className="absolute inset-y-[31.75%] left-[48%] right-1/2 w-[1.5px] rounded-full bg-ui-fg-subtle transition-all duration-300 group-open:rotate-90" />
    <span className="absolute inset-x-[31.75%] bottom-1/2 top-[48%] h-[1.5px] rounded-full bg-ui-fg-subtle transition-all duration-300 group-open:left-1/2 group-open:right-1/2 group-open:rotate-90" />
  </span>
)

export default function PricingPanel({
  currencyCode,
  pricing,
  sizes,
  onChangeSizeQty,
  onAddToCart,
  isSubmitting,
  embeddedOnPdp = false,
  flyImageSrc,
  showDtfTierEstimator = false,
  embedPdpQuantityStepNumber = 3,
}: PricingPanelProps) {
  const quantity = sizes.reduce((total, entry) => total + entry.quantity, 0)
  const [selectedPrintAreaId, setSelectedPrintAreaId] = useState(DTF_PRINT_AREA_OPTIONS[0].id)
  const safeEstimatorQuantity = Math.max(1, quantity)
  const activeDtfTierIndex = resolveDtfQuantityTierIndex(safeEstimatorQuantity)
  const resolvedDtfTierIndex =
    activeDtfTierIndex >= 0 ? activeDtfTierIndex : DTF_QUANTITY_TIERS.length - 1
  const activePrintArea =
    DTF_PRINT_AREA_OPTIONS.find((option) => option.id === selectedPrintAreaId) ??
    DTF_PRINT_AREA_OPTIONS[0]
  const dtfUnitPriceCents = useMemo(
    () =>
      activePrintArea.pricesByTierCents[resolvedDtfTierIndex] ??
      activePrintArea.pricesByTierCents[0] ??
      0,
    [activePrintArea, resolvedDtfTierIndex]
  )
  const dtfTotalPriceCents = dtfUnitPriceCents * safeEstimatorQuantity
  const checkoutTotalCents = quantity > 0 ? pricing.totalPriceCents : 0
  const checkoutUnitCents = quantity > 0 ? pricing.discountedUnitPriceCents : 0

  return (
    <div className="space-y-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ui-fg-base">
          {embeddedOnPdp
            ? `${embedPdpQuantityStepNumber}. Quantity & checkout`
            : "Size & quantity"}
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

      <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle/60 px-3 py-2.5">
        <p className="flex justify-between text-xs">
          <span className="text-ui-fg-subtle">Unit</span>
          <span className="font-medium text-ui-fg-base">{formatMoney(checkoutUnitCents, currencyCode)}</span>
        </p>
        <p className="mt-1.5 flex justify-between text-sm font-semibold">
          <span className="text-ui-fg-base">Checkout total ({quantity})</span>
          <span className="text-ui-fg-base">{formatMoney(checkoutTotalCents, currencyCode)}</span>
        </p>
      </div>

      {showDtfTierEstimator ? (
        <details className="group rounded-lg border border-ui-border-base bg-ui-bg-subtle/40 p-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-ui-fg-base marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              DTF tier estimator
              <ExpandCollapsePlus />
            </span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-ui-border-base pt-3">
            <div>
              <p className="mt-1 text-xs text-ui-fg-subtle">
                Per garment, per print location. Uses your selected quantity to apply the right tier.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ui-fg-subtle">Print area</label>
              <select
                className="w-full rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
                value={activePrintArea.id}
                onChange={(event) => setSelectedPrintAreaId(event.target.value)}
              >
                {DTF_PRINT_AREA_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <p className="flex justify-between text-xs">
              <span className="text-ui-fg-subtle">Applied tier</span>
              <span className="font-medium text-ui-fg-base">
                {DTF_QUANTITY_TIERS[resolvedDtfTierIndex]?.label ?? "Qty 1-9"}
              </span>
            </p>
            <p className="flex justify-between text-xs">
              <span className="text-ui-fg-subtle">Unit price</span>
              <span className="font-medium text-ui-fg-base">
                {formatMoney(dtfUnitPriceCents, currencyCode)}
              </span>
            </p>
            <p className="flex justify-between text-sm font-semibold">
              <span className="text-ui-fg-base">Estimated total ({safeEstimatorQuantity})</span>
              <span className="text-ui-fg-base">{formatMoney(dtfTotalPriceCents, currencyCode)}</span>
            </p>
          </div>
        </details>
      ) : null}

      <details className="group rounded-lg border border-ui-border-base bg-ui-bg-subtle/50">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold text-ui-fg-base marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            Price breakdown
            <ExpandCollapsePlus />
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
        {pricing.hasBulkPricing && pricing.bulkPricingTiers?.length ? (
          <div className="space-y-1 pt-1">
            <p className="font-medium text-ui-fg-base">Bulk pricing tiers</p>
            {pricing.bulkPricingTiers.map((tier) => (
              <p key={formatTierRange(tier.minQuantity, tier.maxQuantity)} className="flex justify-between">
                <span>{formatTierRange(tier.minQuantity, tier.maxQuantity)} pcs</span>
                <span>{formatMoney(tier.amountCents, currencyCode)}</span>
              </p>
            ))}
          </div>
        ) : null}
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

      {flyImageSrc ? (
        <FlyToCartAddButton
          onAddToCart={() => {
            void onAddToCart()
          }}
          disabled={isSubmitting || quantity <= 0}
          isLoading={isSubmitting}
          className="w-full rounded-xl px-4 py-3.5 text-base font-semibold shadow-sm transition hover:opacity-95 disabled:opacity-50"
          flyImageSrc={flyImageSrc}
        >
          {isSubmitting ? "Adding..." : "Add to cart"}
        </FlyToCartAddButton>
      ) : (
        <button
          type="button"
          onClick={() => {
            void onAddToCart()
          }}
          disabled={isSubmitting || quantity <= 0}
          className="w-full rounded-xl bg-ui-fg-base px-4 py-3.5 text-base font-semibold text-ui-bg-base shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {isSubmitting ? "Adding..." : "Add to cart"}
        </button>
      )}
    </div>
  )
}
