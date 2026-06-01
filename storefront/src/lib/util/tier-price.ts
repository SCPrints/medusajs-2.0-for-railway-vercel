import { applyTierMultiplier, type Tier } from "@lib/customer-tiers"

/**
 * Per-customer tier pricing — the storefront half of the backend tier system.
 *
 * Tier customers are priced at a flat `cost × multiplier` (platinum 1.10× …
 * member 1.45×) instead of the public quantity ladder. The backend stores that
 * same formula in a customer_group-scoped Medusa PriceList (see
 * `backend/src/scripts/regenerate-tier-price-lists.ts`), so the cart/checkout
 * charges exactly this — but the catalog is fetched anonymously and cached
 * globally, so its `calculated_price` is the STANDARD price. We recompute the
 * tier price here from the variant's ex-GST cost (already present in the
 * product payload as `variant.metadata.cost_price_ex_gst_minor`).
 *
 * Display == charge is guaranteed because both sides use the identical formula
 * `round(cost_minor × multiplier)` against the same source cost.
 *
 * Returns null whenever the variant has no known cost, so the caller falls back
 * to standard pricing — the same products the tier PriceList can't cover.
 */

/** Ex-GST cost in MINOR units (cents) for a variant, or null when unknown. */
export function getVariantCostMinor(
  variant: { metadata?: Record<string, unknown> | null } | null | undefined
): number | null {
  const raw = (variant?.metadata as Record<string, unknown> | undefined)
    ?.cost_price_ex_gst_minor
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
      ? Number(raw)
      : Number.NaN
  return Number.isFinite(n) && n > 0 ? (n as number) : null
}

/**
 * Tier unit price in MAJOR units (dollars) for a variant — matching Medusa 2.x
 * `price.amount` units used throughout the storefront display path. Null when
 * no tier is active or the variant has no cost.
 */
export function getTierUnitMajorForVariant(
  variant: { metadata?: Record<string, unknown> | null } | null | undefined,
  tier: Tier | null | undefined
): number | null {
  if (!tier) return null
  const costMinor = getVariantCostMinor(variant)
  if (costMinor == null) return null
  // applyTierMultiplier returns MINOR (cents); the backend PriceList divides by
  // 100 to store MAJOR — mirror that exactly so the two never drift.
  return applyTierMultiplier(costMinor, tier) / 100
}

/** True when at least one variant carries a cost the tier price can be built from. */
export function productHasTierableCost(
  product: { variants?: Array<{ metadata?: Record<string, unknown> | null }> | null } | null | undefined
): boolean {
  return (product?.variants ?? []).some((v) => getVariantCostMinor(v) != null)
}
