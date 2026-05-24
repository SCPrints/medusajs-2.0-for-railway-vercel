/**
 * Shared helpers for computing per-tier and headline "you save N%" annotations
 * on bulk-pricing ladders. Used by:
 *   - product-price (PDP variant ladder)
 *   - pricing-panel (customizer quantity-checkout matrix)
 *
 * Both surfaces want consistent framing — "Discount earned" rather than the
 * neutral "Price per quantity" — so the conversion of tier price into "save
 * N%" lives in one place.
 *
 * Convention: tiers are sorted ASCENDING by min_quantity, which means the
 * FIRST tier is the smallest order (highest per-unit price = the baseline)
 * and subsequent tiers are larger orders (lower price). Savings are computed
 * against the first tier's amount.
 *
 * Both functions are pure and trivially testable.
 */

export type TierLike = {
  /** Per-unit amount in minor units (cents for AUD). */
  amount: number
}

/**
 * Per-tier savings percentage vs the first (smallest-qty / highest-price)
 * tier. Always returns the same length as the input. Rounded to nearest
 * integer.
 *
 * - Empty input → empty output.
 * - First tier always returns 0 (it is the baseline).
 * - Baseline <= 0 (degenerate data) → all zeros, never NaN.
 * - A tier priced *higher* than the baseline (shouldn't happen with sorted
 *   data, but possible with malformed input) clamps to 0 — never returns a
 *   negative savings.
 */
export function calculateTierSavingsPercents(tiers: TierLike[]): number[] {
  if (tiers.length === 0) return []
  const base = tiers[0].amount
  if (!Number.isFinite(base) || base <= 0) {
    return tiers.map(() => 0)
  }
  return tiers.map((t) => {
    if (!Number.isFinite(t.amount) || t.amount >= base) return 0
    return Math.round(((base - t.amount) / base) * 100)
  })
}

/**
 * Maximum savings percentage across all tiers — typically the deepest
 * discount available at the highest-quantity tier. Use this for the
 * "Save up to N%" header copy.
 */
export function calculateMaxTierSavingsPercent(tiers: TierLike[]): number {
  if (tiers.length === 0) return 0
  const pcts = calculateTierSavingsPercents(tiers)
  return pcts.length > 0 ? Math.max(...pcts) : 0
}
