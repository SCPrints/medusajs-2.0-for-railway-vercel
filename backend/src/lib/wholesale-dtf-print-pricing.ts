/**
 * SCP Wholesale DTF print price matrix (AUD major units, ex-GST).
 *
 * Quantity bands differ from the retail tier ladder — do not conflate them.
 * Retail uses 1–9 / 10–19 / 20–49 / 50–99 / 100+.
 * Wholesale uses 1–5 / 6–24 / 25–49 / 50–99 / 100+.
 *
 * Keep in sync with storefront mirror:
 * {@link storefront/src/lib/wholesale-dtf-print-pricing.ts}
 */

import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

export type WholesaleQuantityTier = {
  label: string
  minQuantity: number
  maxQuantity?: number
}

export const WHOLESALE_QUANTITY_TIERS: WholesaleQuantityTier[] = [
  { label: "Qty 1–5", minQuantity: 1, maxQuantity: 5 },
  { label: "Qty 6–24", minQuantity: 6, maxQuantity: 24 },
  { label: "Qty 25–49", minQuantity: 25, maxQuantity: 49 },
  { label: "Qty 50–99", minQuantity: 50, maxQuantity: 99 },
  { label: "Qty 100+", minQuantity: 100 },
]

/**
 * Per-print-location unit prices by tier index (0–4), AUD major units (ex-GST).
 * Source: SCP DTF Price List – PROMO.pdf
 */
export const WHOLESALE_PRINT_UNIT_MATRIX: Record<
  ScpPrintSizeId,
  readonly [number, number, number, number, number]
> = {
  up_to_a6: [5.0, 4.0, 3.0, 2.8, 2.5],
  up_to_a4: [6.0, 5.0, 4.0, 3.8, 3.5],
  up_to_a3: [7.0, 6.0, 5.0, 4.8, 4.5],
  oversize: [8.0, 7.0, 6.0, 5.8, 5.5],
}

/** Multipliers by wholesale customer group ID. */
export const WHOLESALE_GARMENT_MULTIPLIERS: Record<string, number> = {
  wholesale_bronze: 1.4,
  wholesale_silver: 1.3,
  wholesale_gold: 1.2,
  wholesale_platinum: 1.1,
}

export const WHOLESALE_GROUP_IDS = Object.keys(WHOLESALE_GARMENT_MULTIPLIERS)

export function isWholesaleGroup(groupName: string): boolean {
  return groupName in WHOLESALE_GARMENT_MULTIPLIERS
}

export function resolveWholesalePrintTierIndex(quantity: number): number {
  const safeQty = Math.max(1, Math.floor(quantity || 1))
  const idx = WHOLESALE_QUANTITY_TIERS.findIndex((tier) => {
    if (safeQty < tier.minQuantity) return false
    if (typeof tier.maxQuantity === "number" && safeQty > tier.maxQuantity) return false
    return true
  })
  return idx >= 0 ? idx : WHOLESALE_QUANTITY_TIERS.length - 1
}

export function wholesalePrintUnitMajorForTier(
  printSizeId: ScpPrintSizeId,
  tierIndex: number
): number {
  const row = WHOLESALE_PRINT_UNIT_MATRIX[printSizeId]
  const idx = Math.min(Math.max(0, tierIndex), row.length - 1)
  return row[idx] ?? 0
}
