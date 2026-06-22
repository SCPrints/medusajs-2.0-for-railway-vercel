/**
 * Pick a variant's base unit price from its RAW price rows.
 *
 * Why raw `variants.prices` and NOT `variants.calculated_price`: the admin
 * `/admin/products` route's query validator (`AdminGetProductsParams`) strips
 * `region_id`/`currency_code` (they're absent from its schema), and the admin
 * route has no `setPricingContext` middleware. So a `calculated_price` request
 * reaches the pricing module with an empty context and throws
 * `MedusaError.INVALID_DATA` → HTTP 400 — regardless of whether `region_id` was
 * in the query string. (This was the "Search failed (400)" bug in the quotes
 * line-item picker and the same latent bug in the POS product search.) Raw
 * prices need no pricing context, so they always load.
 *
 * Selection: prefer the AUD qty 1–9 tier (`min_quantity === 1`) of the base
 * catalogue ladder, excluding tier / price-list override rows (which carry
 * `rules`). Falls back to the lowest band, then any row. `amount` is in MAJOR
 * units (dollars) — importers store `minor / 100` via `tierMinorToPriceSetRows`,
 * which is exactly the unit the old `calculated_amount` produced. Returns null
 * when the variant has no usable price.
 */

export type VariantPriceRow = {
  amount: number
  currency_code: string
  min_quantity?: number | null
  max_quantity?: number | null
  rules?: Record<string, unknown> | null
}

export const pickVariantBasePrice = (
  prices: VariantPriceRow[] | null | undefined
): { amount: number; currency_code: string } | null => {
  const rows = prices ?? []
  if (rows.length === 0) return null
  // Catalogue is AUD-only; prefer AUD but fall back to whatever exists.
  const aud = rows.filter(
    (p) => String(p.currency_code).toLowerCase() === "aud"
  )
  const pool = aud.length ? aud : rows
  // Exclude price-list / customer-tier override rows — we want the base ladder.
  const baseRows = pool.filter(
    (p) => !p.rules || Object.keys(p.rules).length === 0
  )
  const candidates = baseRows.length ? baseRows : pool
  const sorted = candidates
    .slice()
    .sort((a, b) => (a.min_quantity ?? 1) - (b.min_quantity ?? 1))
  const base = sorted.find((p) => (p.min_quantity ?? 1) === 1) ?? sorted[0]
  return base
    ? { amount: base.amount, currency_code: base.currency_code }
    : null
}
