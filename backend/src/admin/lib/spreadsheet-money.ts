/**
 * Money + tier minor-unit types for Admin UI only (`src/admin`).
 * Duplicates shapes from `src/utils/parse-money-to-minor` and `bulk-tier-prices` so the
 * dashboard bundle does not import outside `src/admin` (breaks route loading).
 */

/** AUD tier ladder amounts in minor currency units (e.g. cents). */
export type TierMoneyMinor = {
  base: number
  t10: number
  t50: number
  t100: number
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
