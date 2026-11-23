/**
 * Quote postage → real order shipping. Pure, admin-safe (no framework imports).
 *
 * Staff put postage on a quote as a line ("Postage", "Freight to customer",
 * "Delivery — Maroubra NSW 2035"). Until 24 Nov 2026 that line became an
 * ordinary order item, so the order's shipping total read $0 and reports
 * counted freight as product sales. Conversion now turns these lines into the
 * order's shipping method instead.
 */

/** Postage the customer pays us to send their job. Anchored at the start so
 * "DTF print + inbound freight" style lines stay items. */
const FREIGHT_TITLE = /^(postage|shipping|freight|courier|delivery)\b|^express shipping\b/i

export function isFreightLine(line: { title?: unknown; product_id?: unknown }): boolean {
  return typeof line.title === "string" && FREIGHT_TITLE.test(line.title.trim())
}

/** The shipping amount (inc GST) a freight quote line charges, or null when it has no usable price. */
export function freightAmount(line: { quantity?: unknown; unit_price?: unknown }): number | null {
  if (line.unit_price == null) return null
  const unit = Number(line.unit_price)
  const qty = Number(line.quantity ?? 1)
  if (!Number.isFinite(unit) || unit < 0 || !Number.isFinite(qty) || qty <= 0) return null
  return Math.round(unit * qty * 100) / 100
}
