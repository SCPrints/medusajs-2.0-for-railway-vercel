import { applyTierMultiplier, type Tier } from "@lib/customer-tiers"

/**
 * Per-customer tier pricing — the storefront half of the backend tier system.
 *
 * Tier customers are priced at a flat `cost × multiplier` (platinum 1.30× …
 * member 1.65×) instead of the public quantity ladder. The backend stores that
 * same formula in a customer_group-scoped Medusa PriceList (see
 * `backend/src/scripts/regenerate-tier-price-lists.ts`), so the cart/checkout
 * charges exactly this — but the catalog is fetched anonymously and cached
 * globally, so its `calculated_price` is the STANDARD price.
 *
 * The supplier cost itself (`variant.metadata.cost_price_ex_gst_minor`) is
 * stripped from every store response by the backend
 * (`api/middlewares/strip-variant-cost-metadata.ts`) — it was reaching every
 * browser (code review 2026-10, finding 4-1). So we recover it from the PUBLIC
 * bulk ladder instead: the standard ladder's top band is
 * `cost × 1.1 × 1.5` (= × 1.65) plus the per-unit freight-in stamp ÷ 100
 * (`backend/src/utils/bulk-price-ladder.ts`). Inverting that gives the cost
 * to the cent for every ladder `buildPriceLadder()` wrote, and the tier price
 * then uses the identical `round(cost_minor × multiplier)` the PriceList regen
 * uses — display still equals charge.
 *
 * ponytail: exact only for importer-written ladders. A hand-edited ladder
 * (admin bulk-pricing widget, spreadsheet tier prices) drifts here while
 * checkout still charges the PriceList price. The exact path is an
 * authenticated product fetch (Medusa returns the tier `calculated_price` for
 * a customer in a tier group) — switch to that if drift is ever reported.
 *
 * Returns null whenever no cost can be derived, so the caller falls back to
 * standard pricing — the same products the tier PriceList can't cover.
 */

/** Top band of the standard ladder = cost × 1.1 (supplier GST) × 1.5 (margin). */
const LADDER_TOP_MULTIPLIER = 1.65

const toNumber = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN

// Number.EPSILON nudges binary x.xx5 (29.95 × 0.9 = 26.954999…) onto the cent it means (review 1-9).
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

type VariantLike = { metadata?: Record<string, unknown> | null } | null | undefined

/** Ex-GST cost in MINOR units (cents) derived from the variant's bulk ladder, or null when unknown. */
export function getVariantCostMinor(variant: VariantLike): number | null {
  const bulk = (variant?.metadata as Record<string, unknown> | undefined)?.bulk_pricing as
    | Record<string, unknown>
    | undefined
  if (!bulk || typeof bulk !== "object") return null

  const top = (Array.isArray(bulk.tiers) ? bulk.tiers : [])
    .map((t) => ({
      min: toNumber((t as Record<string, unknown>)?.min_quantity),
      amount: toNumber((t as Record<string, unknown>)?.amount),
    }))
    .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.amount))
    .sort((a, b) => a.min - b.min)
    .pop()
  const topMajor = top ? top.amount : toNumber(bulk.tier_100_plus_price)
  if (!Number.isFinite(topMajor)) return null

  // Per-unit small-order charge baked into the ladder ($15, deliberate; some
  // importers never stamp it). The top band carries `round2(stamp / 100)`.
  const freight = toNumber(bulk.freight_in_aud)
  const freightAtTop = Number.isFinite(freight) ? round2(freight / 100) : 0

  const costMinor = Math.round(((topMajor - freightAtTop) * 100) / LADDER_TOP_MULTIPLIER)
  return costMinor > 0 ? costMinor : null
}

/**
 * Tier unit price in MAJOR units (dollars) for a variant — matching Medusa 2.x
 * `price.amount` units used throughout the storefront display path. Null when
 * no tier is active or the variant has no derivable cost.
 */
export function getTierUnitMajorForVariant(
  variant: VariantLike,
  tier: Tier | null | undefined
): number | null {
  if (!tier) return null
  const costMinor = getVariantCostMinor(variant)
  if (costMinor == null) return null
  // applyTierMultiplier returns MINOR (cents); the backend PriceList divides by
  // 100 to store MAJOR — mirror that exactly so the two never drift.
  return applyTierMultiplier(costMinor, tier) / 100
}

/** True when at least one variant carries a ladder the tier price can be built from. */
export function productHasTierableCost(
  product: { variants?: Array<{ metadata?: Record<string, unknown> | null }> | null } | null | undefined
): boolean {
  return (product?.variants ?? []).some((v) => getVariantCostMinor(v) != null)
}
