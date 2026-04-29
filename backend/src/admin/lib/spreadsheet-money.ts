/**
 * Money + tier minor-unit types for Admin UI only (`src/admin`).
 * Duplicates shapes from `src/utils/parse-money-to-minor` and `bulk-tier-prices` so the
 * dashboard bundle does not import outside `src/admin` (breaks route loading).
 */

/** AUD tier ladder amounts in minor currency units (e.g. cents). Five qty bands. */
export type TierMoneyMinor = {
  t1_9: number
  t10_19: number
  t20_49: number
  t50_99: number
  t100_plus: number
}

/** Round minor units **up** to the nearest 10¢ (e.g. 2995 → 3000). */
export function roundMinorUpToNearestTenCents(minor: number): number {
  return Math.ceil(minor / 10) * 10
}

/**
 * Spreadsheet **Variant Price AUD** is treated as the **100+ qty** unit price (20% discount off catalog list).
 * Implied list = minor100Plus / 0.8. Other tiers use fixed %-off-list steps; each tier amount is rounded **up**
 * to the nearest 10¢:
 *
 * - 1–9:    0% off list
 * - 10–19:  5% off list
 * - 20–49:  10% off list
 * - 50–99:  15% off list
 * - 100+:   20% off list (= anchor column before rounding)
 */
export function deriveTierMinorFromSpreadsheet100PlusAnchor(minor100Plus: number): TierMoneyMinor {
  const ceil10 = roundMinorUpToNearestTenCents
  const listPrecise = minor100Plus / 0.8
  return {
    t1_9: ceil10(listPrecise * 1.0),
    t10_19: ceil10(listPrecise * 0.95),
    t20_49: ceil10(listPrecise * 0.9),
    t50_99: ceil10(listPrecise * 0.85),
    t100_plus: ceil10(listPrecise * 0.8),
  }
}

/** Parse CSV major units (e.g. dollars) → Medusa minor units (e.g. cents). */
export function parseMoneyToMinor(value?: string): number | null {
  if (!value) {
    return null
  }

  const normalized = value.replace(/[^0-9.-]/g, "")
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.round(parsed * 100)
}
