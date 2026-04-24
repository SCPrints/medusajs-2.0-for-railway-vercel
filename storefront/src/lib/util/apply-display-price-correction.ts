import { HttpTypes } from "@medusajs/types"
import { getDisplayUnitMinorForVariant } from "@lib/util/get-product-price"

/**
 * After `enrichLineItems`, line display uses `bulk_pricing` + `resolveHeadlineMinorAmount`.
 * Medusa's `subtotal`/`total`/`tax_total` may still reflect wrong `unit_price` from the API.
 * Rescale those totals proportionally so the summary matches corrected line extensions.
 */
export function applyDisplayPriceCorrectionToCart(cart: HttpTypes.StoreCart) {
  const items = cart.items ?? []
  if (!items.length) {
    return
  }

  let displaySubtotal = 0
  for (const item of items) {
    const v = item.variant as {
      calculated_price?: { calculated_amount?: number }
      metadata?: Record<string, unknown>
    }
    if (!v?.calculated_price?.calculated_amount) {
      continue
    }
    const unit = getDisplayUnitMinorForVariant(v)
    const adjustmentsSum = (item.adjustments || []).reduce(
      (acc: number, adj: { amount?: number }) =>
        acc + (typeof adj.amount === "number" && Number.isFinite(adj.amount) ? adj.amount : 0),
      0
    )
    displaySubtotal += unit * (item.quantity ?? 0) - adjustmentsSum
  }

  const c = cart as HttpTypes.StoreCart & {
    subtotal?: number | null
    tax_total?: number | null
    discount_total?: number | null
    total?: number | null
  }

  const oldSub = Number(c.subtotal ?? 0)
  if (!Number.isFinite(oldSub) || oldSub <= 0 || displaySubtotal === oldSub) {
    return
  }

  const ratio = displaySubtotal / oldSub
  c.subtotal = displaySubtotal
  if (typeof c.tax_total === "number" && Number.isFinite(c.tax_total)) {
    c.tax_total = Math.round(c.tax_total * ratio)
  }
  if (typeof c.discount_total === "number" && Number.isFinite(c.discount_total) && c.discount_total !== 0) {
    c.discount_total = Math.round(c.discount_total * ratio)
  }
  if (typeof c.total === "number" && Number.isFinite(c.total)) {
    c.total = Math.round(c.total * ratio)
  }
}
