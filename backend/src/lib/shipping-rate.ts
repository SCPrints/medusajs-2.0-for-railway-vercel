/**
 * Self-contained weight → price ladder for the single "Standard Shipping (AU)"
 * calculated option (fulfillment provider `scp_scp`). No external carrier
 * dependency: the price is a pure function of the cart's total gram weight
 * (incl. packaging overhead + the default-garment-weight fallback for items
 * with no real weight — see computeCartWeight + SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS).
 *
 * Amounts are AUD DOLLARS (major units), GST-INCLUSIVE — the customer pays
 * exactly the band amount; the scp provider marks the rate tax-inclusive so
 * Medusa extracts the embedded GST (÷11) rather than adding 10% on top.
 * (Was ex-GST before the 2026-07 HOLD cutover; the numbers were deliberately
 * kept — $11 charged became $11.00 instead of $12.10. Major units matches the
 * repo's fulfillment-provider convention, see ShipStation/AusPost providers.)
 *
 * ============================ TUNE THE NUMBERS HERE ============================
 * Garment counts in the comments assume ~300 g/garment + 150 g packaging, so
 * they're a rough guide only. There is intentionally NO env override: shipping
 * prices are deliberate business numbers that belong in code review, not a
 * silently-editable env var. Edit the table, get it reviewed, deploy.
 * =============================================================================
 */

export type ShippingWeightBand = {
  /** inclusive upper bound, grams */
  maxGrams: number
  /** price in AUD dollars (major units, GST-inclusive) */
  amount: number
}

/**
 * Inbound freight-in, AUD, charged ONCE PER ORDER on top of the postage
 * band. Every supplier bills SC Prints ~$10-15 to send the blanks to the
 * workshop; postage below only covers the OUTBOUND leg. Until 2026-10-19
 * this sat in the garment ladder per unit (FREIGHT_IN_ALLOWANCE_AUD) and
 * charged a 5-tee order $75 — see the pricing review 2026-10-08 §4a.
 * Waived with the rest of shipping for free-shipping perks.
 */
export const FREIGHT_IN_PER_ORDER_AUD = 15

/** Outbound postage by weight, BEFORE the per-order freight-in above. */
export const POSTAGE_WEIGHT_BANDS: ShippingWeightBand[] = [
  { maxGrams: 1000, amount: 11 }, // ≈ 1–2 garments
  { maxGrams: 3000, amount: 15 }, // ≈ 3–9 garments
  { maxGrams: 5000, amount: 20 }, // ≈ 10–16 garments
  { maxGrams: 10000, amount: 32 }, // ≈ 17–32 garments
  { maxGrams: 22000, amount: 55 }, // ≈ 33–72 garments
]

/** What the customer pays per band: postage + the per-order freight-in. */
export const SHIPPING_WEIGHT_BANDS: ShippingWeightBand[] = POSTAGE_WEIGHT_BANDS.map(
  (b) => ({ maxGrams: b.maxGrams, amount: b.amount + FREIGHT_IN_PER_ORDER_AUD })
)

/** Above the top band, add this much per kg (or part-kg) over the top threshold. */
export const SHIPPING_OVERAGE_PER_KG = 3

/**
 * Map a total cart weight (grams, incl. overhead) → shipping price in AUD
 * dollars. At/below the top band → the band price. Above it → the top band
 * price plus a per-kg overage, so freight-sized orders keep scaling instead of
 * being undercharged (the "$15 for 20 boxes" bug this whole change fixes).
 */
export const computeShippingAmount = (totalWeightGrams: number): number => {
  const grams =
    Number.isFinite(totalWeightGrams) && totalWeightGrams > 0
      ? totalWeightGrams
      : 0

  for (const band of SHIPPING_WEIGHT_BANDS) {
    if (grams <= band.maxGrams) {
      return band.amount
    }
  }

  const top = SHIPPING_WEIGHT_BANDS[SHIPPING_WEIGHT_BANDS.length - 1]
  const overKg = Math.ceil((grams - top.maxGrams) / 1000)
  return top.amount + overKg * SHIPPING_OVERAGE_PER_KG
}
