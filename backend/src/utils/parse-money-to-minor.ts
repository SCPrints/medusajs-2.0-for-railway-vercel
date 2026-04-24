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

/**
 * For **Medusa export / import CSV** cells where the convention is mixed:
 * - A **decimal point** in the numeric part → value is **major units** (dollars); convert with {@link parseMoneyToMinor}.
 * - **Integer-only** (no `.`) → value is **already minor units** (cents), as Medusa often exports raw `prices.amount`.
 *
 * Supplier spreadsheets with dollar amounts should use decimals (e.g. `14.42`); use {@link parseMoneyToMinor} directly
 * when the source is known to be major units only (see `update-as-colour-pricing.ts`).
 */
export function parseCsvPriceToMedusaMinor(value?: string): number | null {
  if (!value) {
    return null
  }

  const normalized = value.replace(/[^0-9.-]/g, "")
  if (!normalized) {
    return null
  }

  if (normalized.includes(".")) {
    return parseMoneyToMinor(value)
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.round(parsed)
}
