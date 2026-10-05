/**
 * Pure garment-price helpers: the variant `metadata.bulk_pricing` ladder
 * lookup, the customer-tier flat price, and the supplier-cost read. No
 * framework imports, so the admin SPA (the job pricer) runs the exact same
 * lookup the cart does. Extracted from scp-resolve-garment-unit-price.ts,
 * which re-exports them for its existing callers.
 */
import { freightInPerUnit } from "../utils/bulk-price-ladder"
import { applyTierMultiplier, type Tier } from "./customer-tiers"

const round2 = (n: number) => Math.round(n * 100) / 100

/** Ex-GST cost (minor units) stamped on variant metadata by the importers, or null. */
export const readCostMinorFromMetadata = (
  metadata: Record<string, unknown> | null | undefined
): number | null => {
  const raw = metadata?.cost_price_ex_gst_minor
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
      ? Number(raw)
      : Number.NaN
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export type BulkTier = {
  minQuantity: number
  maxQuantity?: number
  amountMajor: number
}

const toFiniteInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value)
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toFiniteMajorAmount = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, "").trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function normalizeBulkPricingTiersFromVariantMetadata(
  metadata: Record<string, unknown> | null | undefined
): BulkTier[] {
  const bulkPricing = metadata?.bulk_pricing as { tiers?: Array<Record<string, unknown>> } | undefined
  if (!bulkPricing || !Array.isArray(bulkPricing.tiers)) {
    return []
  }

  const tiers = (bulkPricing.tiers
    .map((tier) => {
      const minQuantity = toFiniteInt(tier.min_quantity)
      const maxQuantity = toFiniteInt(tier.max_quantity)
      const amountMajor = toFiniteMajorAmount(tier.amount)
      if (minQuantity === null || amountMajor === null) {
        return null
      }
      return {
        minQuantity,
        maxQuantity: maxQuantity ?? undefined,
        amountMajor,
      }
    })
    .filter((tier) => tier !== null) as BulkTier[])
    .sort((a, b) => a.minQuantity - b.minQuantity)

  return tiers
}

const resolveBulkTierMajorForQuantity = (tiers: BulkTier[], quantity: number): number | null => {
  const qty = Math.max(1, Math.floor(quantity || 1))
  const match =
    tiers.find((tier) => {
      if (qty < tier.minQuantity) {
        return false
      }
      if (typeof tier.maxQuantity === "number" && qty > tier.maxQuantity) {
        return false
      }
      return true
    }) ?? tiers[tiers.length - 1]

  return match?.amountMajor ?? null
}

export function garmentMajorFromBulkMetadataOrNull(
  metadata: Record<string, unknown> | null | undefined,
  quantity: number
): number | null {
  const tiers = normalizeBulkPricingTiersFromVariantMetadata(metadata)
  if (!tiers.length) {
    return null
  }
  return resolveBulkTierMajorForQuantity(tiers, quantity)
}

/**
 * Garment unit (major) for a customer, tier-aware.
 *
 * A tier customer pays a FLAT `cost × multiplier` (quantity-independent) that
 * replaces the bulk ladder entirely — identical to the backend tier PriceList
 * (`round(cost_minor × mult) / 100`), so the customizer charge equals what a
 * plain variant would be charged via Medusa. Falls back to the standard
 * quantity-ladder lookup when there's no tier or the variant has no cost (the
 * same products the tier PriceList can't cover). Returns null only when neither
 * a tier price nor a bulk ladder is available (caller then tries
 * calculated_price).
 */
export function garmentMajorWithTier(
  metadata: Record<string, unknown> | null | undefined,
  quantity: number,
  tier?: Tier | null
): number | null {
  if (tier) {
    const costMinor = readCostMinorFromMetadata(metadata)
    if (costMinor !== null) {
      return round2(applyTierMultiplier(costMinor, tier) / 100)
    }
  }
  return garmentMajorFromBulkMetadataOrNull(metadata, quantity)
}

/**
 * Ex-GST garment cost for margin display: the stamped supplier cost, else an
 * ESTIMATE back-derived from the ladder's top band (standard ladder: 100+ =
 * cost × 1.1 × 1.5 + freight-in ÷ 100). Most variants carry no stamped cost.
 */
export function garmentCostExMajor(
  metadata: Record<string, unknown> | null | undefined
): { costExMajor: number | null; estimated: boolean } {
  const stamped = readCostMinorFromMetadata(metadata)
  if (stamped !== null) return { costExMajor: round2(stamped / 100), estimated: false }
  const tiers = normalizeBulkPricingTiersFromVariantMetadata(metadata)
  const top = tiers.length ? tiers[tiers.length - 1].amountMajor : null
  if (top == null || top <= 0) return { costExMajor: null, estimated: false }
  return { costExMajor: round2((top - freightInPerUnit(100)) / 1.65), estimated: true }
}
