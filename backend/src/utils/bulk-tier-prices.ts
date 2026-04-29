/**
 * Quantity-band catalog pricing (AUD) aligned with Ramo/Syzmik/DNC tier ladders.
 * Used by spreadsheet sync admin route — mirrors shapes in `import-dnc-products.ts`.
 */

export type TierMoneyMinor = {
  base: number
  t10: number
  t50: number
  t100: number
}

/** Rows passed to Pricing Module `upsertPriceSets`. */
export function tierMinorToPriceSetRows(
  tiers: TierMoneyMinor,
  currencyCode = "aud"
): Array<Record<string, unknown>> {
  return [
    { amount: tiers.base, currency_code: currencyCode, min_quantity: 1, max_quantity: 9 },
    { amount: tiers.t10, currency_code: currencyCode, min_quantity: 10, max_quantity: 49 },
    { amount: tiers.t50, currency_code: currencyCode, min_quantity: 50, max_quantity: 99 },
    { amount: tiers.t100, currency_code: currencyCode, min_quantity: 100 },
  ]
}

/** Stored on variant `metadata.bulk_pricing` for storefront / export round-trip. */
export function tierMinorToBulkPricingMetadata(
  tiers: TierMoneyMinor,
  source = "spreadsheet-sync"
): Record<string, unknown> {
  return {
    source,
    currency_code: "aud",
    tiers: [
      { min_quantity: 1, max_quantity: 9, amount: tiers.base },
      { min_quantity: 10, max_quantity: 49, amount: tiers.t10 },
      { min_quantity: 50, max_quantity: 99, amount: tiers.t50 },
      { min_quantity: 100, amount: tiers.t100 },
    ],
  }
}
