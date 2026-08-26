/**
 * Supacolour full-colour transfer rate card (AUD major units, inc GST) — the
 * price card used INSTEAD of the DTF matrix when the selected garment is
 * flagged `metadata.decoration_pricing_class = "supacolour"` (poly/blend
 * fabrics where standard DTF risks dye migration; ≥65% polyester per the
 * 2026-08 decision).
 *
 * Cost basis: DSP Supacolour price list 1 Mar 2024, BLOCKER (poly/blend)
 * transfer range + in-house pressing labour. Qty 1-19 is priced at the 20-49
 * transfer rate (Supacolour's bands start at 20) — margins verified in the
 * cost model workbook. Setup ($69 new / $35 repeat, per DESIGN not per
 * colour) is a separate cart line — see NEXT_PUBLIC_SUPACOLOUR_SETUP_VARIANT_ID.
 *
 * Keep in sync with storefront mirror:
 * {@link storefront/src/modules/customizer/lib/scp-supacolour-pricing.ts}
 * Validated by `scripts/check-supacolour-pricing-sync.mjs` (`pnpm check-sync`).
 */

import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

export const SCP_SUPACOLOUR_PRICING_VERSION = 1 as const

/** Per design (one artwork × one position), inc GST — separate cart line. */
export const SUPACOLOUR_SETUP_MAJOR = 69
export const SUPACOLOUR_REPEAT_SETUP_MAJOR = 35

/**
 * Retail per print by DTF-aligned size and quantity tier (Qty 1-9 / 10-19 /
 * 20-49 / 50-99 / 100+). Oversize has no Supacolour size above A3/SQ —
 * quote-only, hence absent from the matrix.
 */
export const SCP_SUPACOLOUR_UNIT_MATRIX: Partial<
  Record<ScpPrintSizeId, readonly [number, number, number, number, number]>
> = {
  up_to_a6: [12, 11, 10.5, 10, 9.5],
  up_to_a4: [16, 15, 14.5, 13.5, 12.5],
  up_to_a3: [22, 21, 20, 18, 16.5],
}

/** Sizes with no Supacolour equivalent — quote-only on flagged garments. */
export const SUPACOLOUR_QUOTE_ONLY_SIZES = new Set<ScpPrintSizeId>(["oversize"])

export function supacolourUnitMajorForTier(
  printSizeId: ScpPrintSizeId,
  tierIndex: number
): number | null {
  const row = SCP_SUPACOLOUR_UNIT_MATRIX[printSizeId]
  if (!row) return null
  const idx = Math.min(Math.max(0, tierIndex), row.length - 1)
  return row[idx] ?? null
}

/** Values of product `metadata.decoration_pricing_class`. Absent = standard DTF. */
export const DECORATION_PRICING_CLASSES = ["supacolour", "quote_only"] as const
export type DecorationPricingClass = (typeof DECORATION_PRICING_CLASSES)[number]

export function parseDecorationPricingClass(
  value: unknown
): DecorationPricingClass | null {
  return value === "supacolour" || value === "quote_only" ? value : null
}
