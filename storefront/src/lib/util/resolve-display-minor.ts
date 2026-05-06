/**
 * Single source of truth for display unit price = Medusa's `calculated_price.calculated_amount`.
 * The previous bulk-vs-calculated reconciler picked tier metadata over Medusa, which let storefront
 * undercount vs admin/Stripe. If a quantity-band price looks wrong, fix the price set in admin —
 * never override here.
 *
 * File/function names retain the `Minor` suffix so existing imports keep compiling, but values are
 * major units (decimal dollars), matching Medusa 2.x `price.amount`.
 */

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

/** Lowest `min_quantity` tier amount from `variant.metadata.bulk_pricing.tiers` (major units), if any. */
export const getFirstBulkTierMinor = (
  variant: { metadata?: Record<string, unknown> } | undefined
): number | undefined => {
  const metadata = (variant?.metadata ?? {}) as Record<string, unknown>
  const bulkPricing = metadata.bulk_pricing as { tiers?: Array<Record<string, unknown>> } | undefined
  if (!Array.isArray(bulkPricing?.tiers) || bulkPricing.tiers.length === 0) {
    return undefined
  }

  const parsed = bulkPricing.tiers
    .map((tier) => {
      const minQuantity = toNumber(tier.min_quantity)
      const amount = toNumber(tier.amount)
      if (!Number.isFinite(minQuantity) || !Number.isFinite(amount)) {
        return null
      }
      return { min_quantity: minQuantity, amount }
    })
    .filter((t): t is { min_quantity: number; amount: number } => t !== null)
    .sort((a, b) => a.min_quantity - b.min_quantity)

  const first = parsed[0]
  return first && Number.isFinite(first.amount) ? first.amount : undefined
}

/** Pass-through stub. Returns Medusa's calculated amount; bulk metadata is no longer consulted. */
export const resolveHeadlineMinorAmount = (
  _bulkTierAmount: number | undefined,
  calculatedAmount: number | undefined
): number => {
  const c = typeof calculatedAmount === "number" && Number.isFinite(calculatedAmount) ? calculatedAmount : null
  return c ?? 0
}

/** Identity stub. Hundredfold-typo workaround removed — data is fixed at the importer boundary. */
export const finalizeAudAsColourMinorIfHundredfoldTypo = (
  resolved: number,
  _apiCalculated: number,
  _productHandle: string | undefined,
  _currencyCode: string | undefined
): number => resolved

type VariantForDisplayMinor = {
  calculated_price?: { calculated_amount?: number; currency_code?: string }
  metadata?: Record<string, unknown>
  product?: { handle?: string }
}

/** Returns Medusa's `calculated_amount` directly (major units). */
export const resolveDisplayMinorForVariant = (variant: VariantForDisplayMinor): number => {
  const c = variant?.calculated_price?.calculated_amount
  return typeof c === "number" && Number.isFinite(c) ? c : 0
}
