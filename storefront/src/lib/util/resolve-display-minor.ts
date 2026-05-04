/**
 * NOTE: file/function names retain `Minor` for stability of imports, but amounts are now in
 * **major units** (dollars) — Medusa 2.x stores `price.amount` as a decimal and our spreadsheet
 * sync writes `bulk_pricing.tiers[].amount` on the same scale.
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

/**
 * When bulk tier and Medusa `calculated_price` disagree by more than this ratio, pick the larger
 * (treats the smaller as a stale / wrong-scale residue). Set conservatively to avoid clobbering
 * real "100+ qty discount vs base price" gaps, which are typically <2× apart.
 */
const BULK_VS_CALCULATED_MISMATCH_RATIO = 2

/**
 * Choose an amount for display when `bulk_pricing` metadata may disagree with Medusa
 * `calculated_price`. Both inputs are in major units (dollars).
 */
export const resolveHeadlineMinorAmount = (
  bulkTierAmount: number | undefined,
  calculatedAmount: number | undefined
): number => {
  const b = typeof bulkTierAmount === "number" && Number.isFinite(bulkTierAmount) ? bulkTierAmount : null
  const c = typeof calculatedAmount === "number" && Number.isFinite(calculatedAmount) ? calculatedAmount : null

  if (b !== null && b > 0 && c !== null && c > 0) {
    if (c >= b * BULK_VS_CALCULATED_MISMATCH_RATIO) {
      return c
    }
    if (b >= c * BULK_VS_CALCULATED_MISMATCH_RATIO) {
      return c
    }
    return b
  }

  if (b !== null && b > 0) {
    return b
  }

  return c ?? 0
}

/**
 * Identity stub kept so existing call sites keep compiling. The hundredfold-typo workaround
 * existed only to compensate for cents-stored-as-dollars rows; that bug is fixed at the
 * importer boundary now (see `backend/src/utils/bulk-tier-prices.ts` and the import scripts).
 */
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

/** Bulk-vs-Medusa reconciler entry point. Returns major-unit amount. */
export const resolveDisplayMinorForVariant = (variant: VariantForDisplayMinor): number => {
  const c = variant?.calculated_price?.calculated_amount
  if (typeof c !== "number" || !Number.isFinite(c)) {
    return 0
  }

  const bulk = getFirstBulkTierMinor(variant as { metadata?: Record<string, unknown> })
  return resolveHeadlineMinorAmount(bulk, c)
}
