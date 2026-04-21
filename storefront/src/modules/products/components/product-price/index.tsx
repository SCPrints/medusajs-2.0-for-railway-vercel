import { clx } from "@medusajs/ui"

import { getProductPrice } from "@lib/util/get-product-price"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type BulkTier = {
  min_quantity: number
  max_quantity?: number
  amount: number
}

const toNumber = (value: unknown) =>
  typeof value === "number"
    ? value
    : typeof value === "string"
    ? Number.parseInt(value, 10)
    : Number.NaN

const getBulkPricingTiers = (variant?: HttpTypes.StoreProductVariant): BulkTier[] => {
  const metadata = (variant?.metadata ?? {}) as Record<string, unknown>
  const bulkPricing = metadata.bulk_pricing as
    | {
        tiers?: Array<Record<string, unknown>>
      }
    | undefined

  if (!Array.isArray(bulkPricing?.tiers)) {
    return []
  }

  return bulkPricing.tiers
    .map((tier) => {
      const minQuantity = toNumber(tier.min_quantity)
      const maxQuantity = toNumber(tier.max_quantity)
      const amount = toNumber(tier.amount)

      if (!Number.isFinite(minQuantity) || !Number.isFinite(amount)) {
        return null
      }

      return {
        min_quantity: minQuantity,
        max_quantity: Number.isFinite(maxQuantity) ? maxQuantity : undefined,
        amount,
      }
    })
    .filter((tier): tier is BulkTier => tier !== null)
    .sort((a, b) => a.min_quantity - b.min_quantity)
}

const resolveTierForQuantity = (tiers: BulkTier[], quantity: number) =>
  tiers.find((tier) => {
    if (quantity < tier.min_quantity) {
      return false
    }
    if (typeof tier.max_quantity === "number" && quantity > tier.max_quantity) {
      return false
    }
    return true
  }) ?? tiers[tiers.length - 1]

const formatTierRange = (tier: BulkTier) =>
  typeof tier.max_quantity === "number"
    ? `${tier.min_quantity}-${tier.max_quantity}`
    : `${tier.min_quantity}+`

export default function ProductPrice({
  product,
  variant,
  quantity = 1,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  quantity?: number
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    return <div className="block w-32 h-9 bg-gray-100 animate-pulse" />
  }

  const bulkTiers = getBulkPricingTiers(variant)
  const activeBulkTier =
    variant && bulkTiers.length ? resolveTierForQuantity(bulkTiers, Math.max(1, quantity)) : null
  const activeUnitAmount = activeBulkTier?.amount ?? selectedPrice.calculated_price_number
  const activeUnitPrice = convertToLocale({
    amount: activeUnitAmount,
    currency_code: selectedPrice.currency_code,
  })
  const baseTierAmount = bulkTiers[0]?.amount ?? activeUnitAmount

  return (
    <div className="flex flex-col text-ui-fg-base">
      <span
        className={clx("text-xl-semi", {
          "text-ui-fg-interactive": selectedPrice.price_type === "sale",
        })}
      >
        {!variant && "From "}
        <span
          data-testid="product-price"
          data-value={activeUnitAmount}
        >
          {activeUnitPrice}
        </span>
      </span>
      {activeBulkTier ? (
        <span className="text-xs text-ui-fg-subtle">
          Bulk tier {formatTierRange(activeBulkTier)} applied at qty {Math.max(1, quantity)}
        </span>
      ) : null}
      {selectedPrice.price_type === "sale" && (
        <>
          <p>
            <span className="text-ui-fg-subtle">Original: </span>
            <span
              className="line-through"
              data-testid="original-product-price"
              data-value={selectedPrice.original_price_number}
            >
              {selectedPrice.original_price}
            </span>
          </p>
          <span className="text-ui-fg-interactive">
            -{selectedPrice.percentage_diff}%
          </span>
        </>
      )}
      {variant && bulkTiers.length > 1 ? (
        <div className="mt-3 rounded-md border border-ui-border-base p-3">
          <p className="mb-2 text-sm font-medium text-ui-fg-base">Bulk pricing</p>
          <div className="space-y-1 text-sm text-ui-fg-subtle">
            {bulkTiers.map((tier) => {
              const savingsPct =
                baseTierAmount > tier.amount
                  ? Math.round(((baseTierAmount - tier.amount) / baseTierAmount) * 100)
                  : 0

              return (
                <div key={formatTierRange(tier)} className="flex items-center justify-between gap-4">
                  <span>{formatTierRange(tier)} pcs</span>
                  <span className="text-ui-fg-base">
                    {convertToLocale({
                      amount: tier.amount,
                      currency_code: selectedPrice.currency_code,
                    })}
                    {savingsPct > 0 ? ` (${savingsPct}% off)` : ""}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
