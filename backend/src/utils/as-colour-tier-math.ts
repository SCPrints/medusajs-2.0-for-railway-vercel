/**
 * Wholesale tiers for AS Colour from supplier cost (minor units, ex GST in CSV).
 * Anchor: 100+ tier = cost × 1.1 (GST) × 1.5 (margin). Other bands are discounts off list L where tier100 = L × 0.8.
 */

export type AsColourTierAmount = {
  min_quantity: number
  max_quantity?: number
  amount: number
}

/** Returns tier amounts in minor units (cents). `costMinor` must be a positive integer. */
export function tiersFromCostMinor(costMinor: number): AsColourTierAmount[] {
  if (!Number.isFinite(costMinor) || costMinor <= 0) {
    throw new Error("tiersFromCostMinor: costMinor must be a positive finite number")
  }

  const tier100 = Math.round(costMinor * 1.1 * 1.5)
  const L = tier100 / 0.8

  return [
    { min_quantity: 1, max_quantity: 9, amount: Math.round(L) },
    { min_quantity: 10, max_quantity: 19, amount: Math.round(L * 0.95) },
    { min_quantity: 20, max_quantity: 49, amount: Math.round(L * 0.9) },
    { min_quantity: 50, max_quantity: 99, amount: Math.round(L * 0.85) },
    { min_quantity: 100, amount: tier100 },
  ]
}
