/**
 * Search popularity: the tiebreaker Meili uses after text relevance, so a
 * best-seller beats an obscure product that matches the words equally well
 * ("hoodie" → AS Colour/Biz staples before niche lines).
 *
 * Inputs live on product metadata:
 *  - `sales_90d` — units sold in the last 90 days, written nightly by the
 *    refresh-search-popularity job.
 *  - `search_boost` — staff-set staple flag (true, or a number 1-9 for
 *    stronger boosts). Set it in the product's metadata in admin.
 */

export const SALES_WINDOW_DAYS = 90

/** One boost step outranks any realistic 90-day unit count. */
const BOOST_STEP = 100_000

export function searchPopularity(meta: Record<string, unknown> | null | undefined): number {
  const m = meta || {}
  const raw = m.search_boost
  const boost =
    raw === true || raw === "true" ? 1 : Math.max(0, Math.min(9, Math.floor(Number(raw) || 0)))
  const sales = Math.max(0, Math.floor(Number(m.sales_90d) || 0))
  return boost * BOOST_STEP + Math.min(sales, BOOST_STEP - 1)
}

/** Medusa 2.21 returns quantities as BigNumber-ish objects from query.graph. */
const toQty = (q: unknown): number => {
  if (q && typeof q === "object") {
    const o = q as Record<string, unknown>
    return Number(o.numeric ?? o.value ?? o.raw ?? 0) || 0
  }
  return Number(q) || 0
}

export type PopularityOrder = {
  status?: string | null
  created_at?: string | Date | null
  items?: Array<{ product_id?: string | null; quantity?: unknown } | null> | null
}

/** Units sold per product since `sinceMs`, ignoring cancelled orders. */
export function unitsSoldByProduct(orders: PopularityOrder[], sinceMs: number): Map<string, number> {
  const out = new Map<string, number>()
  for (const order of orders) {
    if (!order || String(order.status || "").toLowerCase() === "canceled") continue
    const at = order.created_at ? new Date(order.created_at).getTime() : NaN
    if (!Number.isFinite(at) || at < sinceMs) continue
    for (const item of order.items || []) {
      const id = item?.product_id
      if (!id) continue
      out.set(id, (out.get(id) ?? 0) + toQty(item.quantity))
    }
  }
  return out
}
