/**
 * SYNC TARGET: storefront/src/lib/customer-tiers.ts
 *
 * Backend = canonical source. Mirror any change to the storefront file and run
 * `scripts/check-customer-tiers-sync.mjs` to enforce parity.
 *
 * Customer pricing tiers. Eight ranks, top to bottom by margin:
 *
 *   1  platinum     1.30   (top — thinnest margin we offer, ~15% ex-GST)
 *   2  gold_plus    1.35
 *   3  gold         1.40
 *   4  silver_plus  1.45
 *   5  silver       1.50
 *   6  bronze_plus  1.55
 *   7  bronze       1.60
 *   8  member       1.65   (entry — equals the public 100+ ladder floor, ~33%)
 *
 * The multiplier is applied to ex-GST supplier cost. Since the 2026-08
 * inc-GST cutover (HOLD) the result is a GST-INCLUSIVE sticker, so the real
 * ex-GST margin is (mult/1.1 − 1) ÷ (mult/1.1). The 2026-08 rebase from
 * 1.10–1.45 exists because the cutover had silently cut Platinum to 0% margin
 * (blanks sold at exactly cost).
 *
 * Anonymous visitors and customers not in a tier group see the standard 5-band
 * quantity ladder (cost × 1.65 at qty 100+ up to cost × 2.2 at qty 1-9).
 *
 * Tier customers see a single flat price (multiplier × cost). Their
 * calculated_price flows from a Medusa PriceList (one per tier, type=OVERRIDE)
 * scoped to the matching CustomerGroup via price_list_rules.
 */

export const TIER_GROUP_NAME_PREFIX = "Tier: "

export const TIER_SLUGS = [
  "platinum",
  "gold_plus",
  "gold",
  "silver_plus",
  "silver",
  "bronze_plus",
  "bronze",
  "member",
] as const

export type TierSlug = (typeof TIER_SLUGS)[number]

export type Tier = {
  slug: TierSlug
  name: string
  multiplier: number
  rank: number
}

export const TIERS: readonly Tier[] = [
  { slug: "platinum",    name: "Tier: Platinum",    multiplier: 1.30, rank: 1 },
  { slug: "gold_plus",   name: "Tier: Gold Plus",   multiplier: 1.35, rank: 2 },
  { slug: "gold",        name: "Tier: Gold",        multiplier: 1.40, rank: 3 },
  { slug: "silver_plus", name: "Tier: Silver Plus", multiplier: 1.45, rank: 4 },
  { slug: "silver",      name: "Tier: Silver",      multiplier: 1.50, rank: 5 },
  { slug: "bronze_plus", name: "Tier: Bronze Plus", multiplier: 1.55, rank: 6 },
  { slug: "bronze",      name: "Tier: Bronze",      multiplier: 1.60, rank: 7 },
  { slug: "member",      name: "Tier: Member",      multiplier: 1.65, rank: 8 },
] as const

export function getTierBySlug(slug: string | null | undefined): Tier | null {
  if (!slug) return null
  return TIERS.find((t) => t.slug === slug) ?? null
}

export function getTierByName(name: string | null | undefined): Tier | null {
  if (!name) return null
  return TIERS.find((t) => t.name === name) ?? null
}

export function isTierSlug(value: unknown): value is TierSlug {
  return typeof value === "string" && (TIER_SLUGS as readonly string[]).includes(value)
}

export type CustomerGroupLike = {
  id?: string | null
  name?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Resolve a tier from a single customer group. Reads `metadata.tier_slug`
 * (canonical), falls back to matching `name` against `TIERS`.
 */
export function tierForGroup(group: CustomerGroupLike | null | undefined): Tier | null {
  if (!group) return null
  const meta = (group.metadata ?? {}) as Record<string, unknown>
  const slug = typeof meta.tier_slug === "string" ? meta.tier_slug : null
  if (slug) {
    const t = getTierBySlug(slug)
    if (t) return t
  }
  return getTierByName(group.name ?? null)
}

export type CustomerLike = {
  groups?: ReadonlyArray<CustomerGroupLike> | null
}

/**
 * Resolve the active tier for a customer. If the customer is somehow in
 * multiple tier groups (data anomaly) the highest-margin tier wins (lowest
 * `rank`) — that's the one giving them the best price, which is the safer
 * default until staff resolve the duplicate via the admin widget.
 */
export function tierForCustomer(customer: CustomerLike | null | undefined): Tier | null {
  const groups = customer?.groups ?? []
  let best: Tier | null = null
  for (const g of groups) {
    const t = tierForGroup(g)
    if (t && (!best || t.rank < best.rank)) {
      best = t
    }
  }
  return best
}

/** Apply a tier's multiplier to an ex-GST cost in minor units (cents). */
export function applyTierMultiplier(costMinor: number, tier: Tier): number {
  return Math.round(costMinor * tier.multiplier)
}
