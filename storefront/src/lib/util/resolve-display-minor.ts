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

/** Lowest `min_quantity` tier amount from `variant.metadata.bulk_pricing.tiers`, if any. */
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
 * Choose a minor-unit amount for display when `bulk_pricing` metadata may disagree with
 * Medusa `calculated_price` (e.g. tiers stored at wrong scale).
 */
export const resolveHeadlineMinorAmount = (
  bulkTierAmount: number | undefined,
  calculatedMinor: number | undefined
): number => {
  const b = typeof bulkTierAmount === "number" && Number.isFinite(bulkTierAmount) ? bulkTierAmount : null
  const c = typeof calculatedMinor === "number" && Number.isFinite(calculatedMinor) ? calculatedMinor : null

  if (b !== null && b > 0 && c !== null && c > 0) {
    if (c >= b * 50) {
      return c
    }
    if (b >= c * 50) {
      return c
    }
    return b
  }

  if (b !== null && b > 0) {
    return b
  }

  return c ?? 0
}
