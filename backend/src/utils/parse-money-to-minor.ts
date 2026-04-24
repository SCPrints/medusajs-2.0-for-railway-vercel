/**
 * Parse a CSV / human-entered money string as **major units** (e.g. AUD dollars)
 * into Medusa **minor units** (e.g. cents). Medusa `prices[].amount` and store
 * `calculated_amount` use minor units.
 */
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

