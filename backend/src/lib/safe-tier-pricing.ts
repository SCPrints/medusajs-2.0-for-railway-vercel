/**
 * Below-cost guard for tier-pricing writes — the enforced chokepoint that
 * makes the 2026-08-12 DNC pricing inversion structurally impossible.
 *
 * What happened: the spreadsheet-sync flow treats "Variant Price AUD" as the
 * RETAIL 100+ tier, but a sheet containing supplier TRADE costs was fed
 * through it, overwriting 18,352 correct DNC ladders with cost-as-retail
 * (the 100+ tier landed BELOW cash cost). Nothing could catch it because the
 * variants carried no cost metadata; the repair stamped
 * `cost_price_ex_gst_minor` on all of them, which is what this guard reads.
 *
 * Pattern follows `safe-product-images.ts` / `planImageWrite`: pure decision
 * logic here (unit-tested), enforcement in the route that performs writes.
 */

/**
 * Multiplier from ex-GST supplier cost to the cash SC Prints actually pays
 * (the supplier invoice adds 10% GST). Retail below `cost × 1.1` is selling
 * at a loss before any margin. Matches the ladder formula's `cost * 1.1`
 * term in `utils/bulk-price-ladder.ts`.
 */
export const CASH_COST_MULTIPLIER = 1.1

export type TierPricingViolation = {
  variant_id: string
  sku: string | null
  /** Ex-GST supplier cost, minor units (from variant metadata). */
  cost_ex_gst_minor: number
  /** cost × 1.1 — the minimum sane retail, minor units. */
  cash_cost_minor: number
  /** The proposed 100+ tier price, minor units. */
  t100_plus_minor: number
}

/**
 * True when a proposed 100+ tier price sits below the cash cost implied by
 * the variant's stamped ex-GST cost. Variants with no usable cost return
 * false — the guard can only check what it can see.
 */
export function isBelowCost(
  t100PlusMinor: number,
  costExGstMinor: number | null | undefined
): boolean {
  if (
    typeof costExGstMinor !== "number" ||
    !Number.isFinite(costExGstMinor) ||
    costExGstMinor <= 0
  ) {
    return false
  }
  return t100PlusMinor < Math.round(costExGstMinor * CASH_COST_MULTIPLIER)
}

/** Read `cost_price_ex_gst_minor` from variant metadata, tolerating junk. */
export function costExGstMinorFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): number | null {
  const raw = metadata?.cost_price_ex_gst_minor
  const n = typeof raw === "string" ? Number(raw) : raw
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/**
 * Validate a batch of proposed tier-price writes against each variant's
 * stamped cost. Returns every violation; the caller blocks the WHOLE batch
 * when any exist (all-or-nothing, like `planImageWrite`'s abort-don't-empty
 * rule) unless the operator explicitly forces — a sheet whose price column
 * holds costs will violate en masse, and a partial apply would leave the
 * catalog half-inverted.
 */
export function findBelowCostViolations(
  items: Array<{
    variant_id: string
    sku?: string | null
    t100_plus_minor: number
    cost_ex_gst_minor: number | null
  }>
): TierPricingViolation[] {
  const violations: TierPricingViolation[] = []
  for (const item of items) {
    if (item.cost_ex_gst_minor === null) continue
    if (!isBelowCost(item.t100_plus_minor, item.cost_ex_gst_minor)) continue
    violations.push({
      variant_id: item.variant_id,
      sku: item.sku ?? null,
      cost_ex_gst_minor: item.cost_ex_gst_minor,
      cash_cost_minor: Math.round(item.cost_ex_gst_minor * CASH_COST_MULTIPLIER),
      t100_plus_minor: item.t100_plus_minor,
    })
  }
  return violations
}
