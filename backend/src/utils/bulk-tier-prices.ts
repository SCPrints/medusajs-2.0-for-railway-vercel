/**
 * Quantity-band catalog pricing (AUD) aligned with Ramo/Syzmik/DNC tier ladders.
 * Used by spreadsheet sync admin route — mirrors shapes in `import-dnc-products.ts`.
 *
 * Spreadsheet sync convention: **variant AUD unit price = 100+ qty tier** (20% off list).
 * Other tiers are derived from implied list price `t100_plus / 0.8`, then each band amount is
 * rounded **up** to the nearest 10¢ — see `deriveTierMinorFromSpreadsheet100PlusAnchor` in admin bundle copy.
 */

/** AUD tier ladder amounts in minor currency units (e.g. cents). Five qty bands. */
export type TierMoneyMinor = {
  /** qty 1–9 */
  t1_9: number
  /** qty 10–19 */
  t10_19: number
  /** qty 20–49 */
  t20_49: number
  /** qty 50–99 */
  t50_99: number
  /** qty 100+ */
  t100_plus: number
}

/** Rows passed to Pricing Module `upsertPriceSets`. */
export function tierMinorToPriceSetRows(
  tiers: TierMoneyMinor,
  currencyCode = "aud"
): Array<Record<string, unknown>> {
  return [
    {
      amount: tiers.t1_9,
      currency_code: currencyCode,
      min_quantity: 1,
      max_quantity: 9,
    },
    {
      amount: tiers.t10_19,
      currency_code: currencyCode,
      min_quantity: 10,
      max_quantity: 19,
    },
    {
      amount: tiers.t20_49,
      currency_code: currencyCode,
      min_quantity: 20,
      max_quantity: 49,
    },
    {
      amount: tiers.t50_99,
      currency_code: currencyCode,
      min_quantity: 50,
      max_quantity: 99,
    },
    { amount: tiers.t100_plus, currency_code: currencyCode, min_quantity: 100 },
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
      { min_quantity: 1, max_quantity: 9, amount: tiers.t1_9 },
      { min_quantity: 10, max_quantity: 19, amount: tiers.t10_19 },
      { min_quantity: 20, max_quantity: 49, amount: tiers.t20_49 },
      { min_quantity: 50, max_quantity: 99, amount: tiers.t50_99 },
      { min_quantity: 100, amount: tiers.t100_plus },
    ],
    ladder_note:
      "Spreadsheet column Variant Price AUD = 100+ qty tier (20% off list); other tiers derived from list.",
  }
}
