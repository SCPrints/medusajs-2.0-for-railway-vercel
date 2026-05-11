/**
 * SCP Wholesale DTF print price matrix (AUD major units, ex-GST).
 *
 * Quantity bands match the retail tier ladder: 1–9 / 10–19 / 20–49 / 50–99 / 100+.
 * Use resolveScpTierIndexForQuantity() (from scp-dtf-print-pricing) to get the
 * tier index, then wholesalePrintUnitMajorForTier() to get the price.
 *
 * Keep in sync with storefront mirror:
 * {@link storefront/src/lib/wholesale-dtf-print-pricing.ts}
 */

import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

/**
 * Per-print-location unit prices by tier index (0–4), AUD major units (ex-GST).
 * Tier indices match the retail quantity bands (1–9, 10–19, 20–49, 50–99, 100+).
 * Source: SCP DTF Price List – PROMO.pdf, mapped onto retail quantity bands.
 */
export const WHOLESALE_PRINT_UNIT_MATRIX: Record<
  ScpPrintSizeId,
  readonly [number, number, number, number, number]
> = {
  up_to_a6: [5.0, 4.0, 3.0, 2.8, 2.5],
  up_to_a4: [6.0, 5.0, 4.0, 3.8, 3.5],
  up_to_a3: [7.0, 6.0, 5.0, 4.8, 4.5],
  oversize:  [8.0, 7.0, 6.0, 5.8, 5.5],
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

export function wholesalePrintUnitMajorForTier(
  printSizeId: ScpPrintSizeId,
  tierIndex: number
): number {
  const row = WHOLESALE_PRINT_UNIT_MATRIX[printSizeId]
  const idx = Math.min(Math.max(0, tierIndex), row.length - 1)
  return row[idx] ?? 0
}
