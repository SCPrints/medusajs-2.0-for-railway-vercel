import { HttpTypes } from "@medusajs/types"

import { getProductPrice, getPricesForVariant } from "@lib/util/get-product-price"
import { convertToLocale } from "@lib/util/money"
import {
  finalizeAudAsColourMinorIfHundredfoldTypo,
  resolveDisplayMinorForVariant,
  resolveHeadlineMinorAmount,
} from "@lib/util/resolve-display-minor"

type BulkTier = {
  min_quantity: number
  max_quantity?: number
  amount: number
}

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    if (!cleaned) {
      return Number.NaN
    }
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : Number.NaN
  }
  return Number.NaN
}

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

  const parsed = bulkPricing.tiers
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
      } as BulkTier
    })
    .filter((tier): tier is BulkTier => tier !== null)

  return parsed.sort((a, b) => a.min_quantity - b.min_quantity)
}

const getBulkPricingCurrency = (variant?: HttpTypes.StoreProductVariant) => {
  const metadata = (variant?.metadata ?? {}) as Record<string, unknown>
  const bulkPricing = metadata.bulk_pricing as
    | {
        currency_code?: unknown
      }
    | undefined

  return typeof bulkPricing?.currency_code === "string"
    ? bulkPricing.currency_code.toLowerCase()
    : null
}

/**
 * Same matching rule as PDP `option-select` / `ProductPrice` — tier whose range
 * includes `quantity` (e.g. 100 for “100+” unit pricing on the card).
 */
const resolveTierForQuantityInRange = (
  tiers: BulkTier[],
  quantity: number
): BulkTier | null => {
  const match = tiers.find((tier) => {
    if (quantity < tier.min_quantity) {
      return false
    }
    if (typeof tier.max_quantity === "number" && quantity > tier.max_quantity) {
      return false
    }
    return true
  })
  return match ?? null
}

const variantWithProductHandle = (product: HttpTypes.StoreProduct, variant: any) => ({
  ...variant,
  product: {
    ...(variant?.product ?? {}),
    handle:
      (typeof variant?.product?.handle === "string" && variant.product.handle) ||
      product?.handle,
  },
})

function getCheapestVariant(
  product: HttpTypes.StoreProduct
): HttpTypes.StoreProductVariant | null {
  const list = (product.variants ?? []).filter((v) => (v as any)?.calculated_price) as
    | HttpTypes.StoreProductVariant[]
    | undefined
  if (!list?.length) {
    return null
  }
  const withHandle = (v: HttpTypes.StoreProductVariant) =>
    variantWithProductHandle(product, v) as {
      calculated_price: NonNullable<typeof v>["calculated_price"]
    }
  return [...list].sort(
    (a, b) =>
      resolveDisplayMinorForVariant(withHandle(a) as any) -
      resolveDisplayMinorForVariant(withHandle(b) as any)
  )[0]
}

/**
 * `From $X * ex GST` (cheapest / “from” display) and optional `100+ $Y ex GST` when
 * bulk_pricing has a tier whose range includes quantity 100.
 */
export function getProductListingCardPriceLines(
  product: HttpTypes.StoreProduct
): {
  fromLine: string
  hundredPlusLine: string | null
} {
  const { cheapestPrice } = getProductPrice({ product })
  if (!cheapestPrice) {
    return {
      fromLine: "Request quote",
      hundredPlusLine: null,
    }
  }

  const fromLine = `From ${cheapestPrice.calculated_price} * ex GST`

  const v = getCheapestVariant(product)
  if (!v) {
    return { fromLine, hundredPlusLine: null }
  }

  const merged = variantWithProductHandle(product, v)
  const selectedPrice = getPricesForVariant(merged as any)
  if (!selectedPrice) {
    return { fromLine, hundredPlusLine: null }
  }

  const bulkTiers = getBulkPricingTiers(v)
  if (bulkTiers.length === 0) {
    return { fromLine, hundredPlusLine: null }
  }

  const tier100 = resolveTierForQuantityInRange(bulkTiers, 100)
  if (!tier100) {
    return { fromLine, hundredPlusLine: null }
  }

  const currencyCode = selectedPrice.currency_code ?? getBulkPricingCurrency(v) ?? "aud"
  const firstTierRaw = bulkTiers[0]?.amount
  const calcMinor = selectedPrice.calculated_price_number
  const firstTierResolved =
    typeof firstTierRaw === "number" &&
    firstTierRaw > 0 &&
    typeof calcMinor === "number" &&
    Number.isFinite(calcMinor)
      ? finalizeAudAsColourMinorIfHundredfoldTypo(
          resolveHeadlineMinorAmount(firstTierRaw, calcMinor),
          calcMinor,
          product.handle,
          currencyCode
        )
      : null
  const bulkMinorScale =
    typeof firstTierRaw === "number" &&
    firstTierRaw > 0 &&
    firstTierResolved !== null &&
    Number.isFinite(firstTierResolved)
      ? firstTierResolved / firstTierRaw
      : 1
  const scaledTierMinor = (tier: BulkTier) => Math.round(tier.amount * bulkMinorScale)
  const tierMinor = scaledTierMinor(tier100)
  if (!Number.isFinite(tierMinor) || tierMinor < 0) {
    return { fromLine, hundredPlusLine: null }
  }

  const hundredFormatted = convertToLocale({
    amount: tierMinor,
    currency_code: currencyCode,
  })

  const hundredPlusLine = `100+ ${hundredFormatted} ex GST`

  return { fromLine, hundredPlusLine }
}
