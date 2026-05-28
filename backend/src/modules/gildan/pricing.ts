import { buildPriceLadder, type PriceLadder } from "../../utils/bulk-price-ladder"

/**
 * Map a Gildan Classic-tier supplier cost to SC Prints' retail ladder.
 *
 * Gildan ships THREE wholesale tiers per row:
 *   Heavyweight (cheapest, volume-tier customer)
 *   Midweight   (mid-tier)
 *   Classic     (entry-tier — SC Prints' assigned tier as of 2026-05)
 *
 * Per the operator (2026-05-28): "Classic is the price we get charged.
 * I believe it's ex GST." So Classic feeds straight into the shared
 * `buildPriceLadder()` ex-GST formula, multiplied by a cost-adjustment
 * for calibration (default 1.0).
 *
 * If Gildan reassigns SC Prints to Heavyweight or Midweight later, swap
 * `pickCostColumn` here — the rest of the pipeline doesn't care which
 * column drove the number.
 *
 * Returns `null` if no usable cost is available (typical for run-out
 * styles where Gildan zeroed the price columns).
 */
export function priceLadderFromGildan(
  classicCost: number | null | undefined,
  costAdjustment: number = 1.0
): PriceLadder | null {
  const cost = resolveGildanCost(classicCost, costAdjustment)
  return cost === null ? null : buildPriceLadder(cost)
}

/**
 * Resolve the adjusted ex-GST cost (AUD major units) from a Gildan row.
 * Importers persist this as `variant.metadata.cost_price_ex_gst_minor`
 * so the tier-pricing regeneration job has a single canonical input.
 */
export function resolveGildanCost(
  classicCost: number | null | undefined,
  costAdjustment: number = 1.0
): number | null {
  if (classicCost === null || classicCost === undefined) return null
  const n = Number(classicCost)
  if (!Number.isFinite(n) || n <= 0) return null
  const adjustment =
    Number.isFinite(costAdjustment) && costAdjustment > 0 ? costAdjustment : 1.0
  return n * adjustment
}
