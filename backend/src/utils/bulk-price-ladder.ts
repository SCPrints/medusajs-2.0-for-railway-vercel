/**
 * Bulk-pricing ladder shared by every catalog importer that ingests a
 * single wholesale "cost" price and produces SC Prints' standard 5-tier
 * retail ladder (qty 1-9 / 10-19 / 20-49 / 50-99 / 100+).
 *
 *   cost     = supplier trade price (ex GST), AUD major units (dollars)
 *   100+     = cost * 1.10 * 1.5  (= cost * 1.65)
 *              — the 1.10 is the GST we PAY the supplier (their invoice adds
 *              GST to the trade price), so 1.5 is margin on our CASH cost.
 *              The output is an EX-GST sell price; Medusa adds 10% sales GST
 *              at checkout. It is NOT a GST-inclusive sell price — a 2026-07
 *              review misread it that way and concluded GST was charged twice.
 *   standard = 100+ / 0.75        (= cost * 2.20)
 *   10-19    = standard * 0.90
 *   20-49    = standard * 0.85
 *   50-99    = standard * 0.80
 *   base     = standard           (covers Medusa qty 1-9)
 *
 * Since 2026-08-27 every band ALSO carries an inbound freight-in allowance
 * (`FREIGHT_IN_ALLOWANCE_AUD`, full at 1-9, amortized over the band minimum
 * above) — see the constant's doc comment.
 *
 * Originally ported from `scripts/build_as_colour_import_csv.py`.
 *
 * NOTE: a separate, slightly different formula (`tiersFromCostMinor` in
 * `backend/src/utils/as-colour-tier-math.ts`) is used by the CSV-generation
 * scripts. Do not unify them blindly — the math is different on purpose.
 */

export type PriceLadder = {
  base: number
  tier10to19: number
  tier20to49: number
  tier50to99: number
  tier100Plus: number
  standard: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Inbound freight-in allowance, AUD, per supplier consignment.
 *
 * Every supplier bills SC Prints freight (~$10-15) per order sent to the
 * workshop, and the customer's weight-based "Standard Shipping" only covers
 * OUTBOUND postage — so a single-garment order used to eat the inbound
 * freight (decided 2026-08-27 off order #79: two 1-garment consignments,
 * $11 shipping collected, ~$20+ inbound freight paid). Baked into the
 * retail ladder: full at qty 1-9, amortized over the band minimum above.
 */
export const FREIGHT_IN_ALLOWANCE_AUD = 15

/** Per-unit freight add for a quantity band starting at `minQty`. */
export const freightInPerUnit = (minQty: number): number =>
  round2(FREIGHT_IN_ALLOWANCE_AUD / Math.max(1, minQty))

export const buildPriceLadder = (cost: number): PriceLadder => {
  const tier100PlusVal = cost * 1.1 * 1.5
  const standard = tier100PlusVal / 0.75

  return {
    base: round2(standard + freightInPerUnit(1)),
    tier10to19: round2(standard * 0.9 + freightInPerUnit(10)),
    tier20to49: round2(standard * 0.85 + freightInPerUnit(20)),
    tier50to99: round2(standard * 0.8 + freightInPerUnit(50)),
    tier100Plus: round2(tier100PlusVal + freightInPerUnit(100)),
    standard: round2(standard + freightInPerUnit(1)),
  }
}

/** Convert a major-unit AUD value to Medusa minor units (cents). */
export const toMinorAud = (major: number): number => Math.round(major * 100)

/**
 * Build the `metadata.bulk_pricing` block consumed by the storefront tier
 * pricing display and the customizer's calculatePricing() function.
 *
 * Includes both the legacy flat fields (backwards compat) and a `tiers`
 * array in the shape getBulkPricingTiers() reads:
 *   { min_quantity, max_quantity?, amount }  — amount in minor units (cents).
 */
export const buildBulkPricingMetadata = (ladder: PriceLadder) => ({
  // Stamp so the one-off apply-freight-in-allowance script knows this
  // ladder already carries the inbound-freight allowance.
  freight_in_aud: FREIGHT_IN_ALLOWANCE_AUD,
  base_sale_price: ladder.base,
  tier_10_to_19_price: ladder.tier10to19,
  tier_20_to_49_price: ladder.tier20to49,
  tier_50_to_99_price: ladder.tier50to99,
  tier_100_plus_price: ladder.tier100Plus,
  tiers: [
    { min_quantity: 1, max_quantity: 9, amount: ladder.base },
    { min_quantity: 10, max_quantity: 19, amount: ladder.tier10to19 },
    { min_quantity: 20, max_quantity: 49, amount: ladder.tier20to49 },
    { min_quantity: 50, max_quantity: 99, amount: ladder.tier50to99 },
    { min_quantity: 100, amount: ladder.tier100Plus },
  ],
})
