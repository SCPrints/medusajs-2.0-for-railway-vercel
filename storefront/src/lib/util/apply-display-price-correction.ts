import { HttpTypes } from "@medusajs/types"
import {
  cartLineUsesExplicitUnitPrice,
  resolveCartLineDisplayUnitMinor,
  variantWithInferredHandleForLineItem,
} from "@lib/util/cart-line-display-unit"

export type TotalsMutableForDisplay = {
  items?: unknown[] | null
  subtotal?: number | null
  tax_total?: number | null
  discount_total?: number | null
  total?: number | null
}

/**
 * After `enrichLineItems`, line display uses `bulk_pricing` + `resolveHeadlineMinorAmount`.
 * Medusa's `subtotal`/`total`/`tax_total` may still reflect wrong `unit_price` from the API.
 * Rescale those totals proportionally so the summary matches corrected line extensions.
 *
 * Applies to store carts and orders that expose the same totals + line shapes after enrichment.
 */
export function applyDisplayPriceCorrection(subject: TotalsMutableForDisplay) {
  const items =
    subject.items as
      | HttpTypes.StoreCartLineItem[]
      | HttpTypes.StoreOrderLineItem[]
      | null
      | undefined

  if (!items?.length) {
    return
  }

  let displaySubtotal = 0
  for (const item of items) {
    const adjustmentsSum = (item.adjustments || []).reduce(
      (acc: number, adj: { amount?: number }) =>
        acc + (typeof adj.amount === "number" && Number.isFinite(adj.amount) ? adj.amount : 0),
      0
    )
    const variantForPricing = variantWithInferredHandleForLineItem(item)
    const unit = resolveCartLineDisplayUnitMinor(item, variantForPricing)
    if (!cartLineUsesExplicitUnitPrice(item) && !unit) {
      continue
    }
    displaySubtotal += unit * (item.quantity ?? 0) - adjustmentsSum
  }

  if (!Number.isFinite(displaySubtotal) || displaySubtotal <= 0) {
    return
  }

  const mutable = subject as TotalsMutableForDisplay & {
    subtotal?: number | null
    tax_total?: number | null
    discount_total?: number | null
    total?: number | null
  }

  const oldSub = Number(mutable.subtotal ?? 0)
  if (!Number.isFinite(oldSub) || oldSub <= 0 || displaySubtotal === oldSub) {
    return
  }

  const ratio = displaySubtotal / oldSub
  // Totals are major units (decimals) — round to 2dp to preserve cent precision.
  const round2 = (n: number) => Math.round(n * 100) / 100
  mutable.subtotal = round2(displaySubtotal)
  if (typeof mutable.tax_total === "number" && Number.isFinite(mutable.tax_total)) {
    mutable.tax_total = round2(mutable.tax_total * ratio)
  }
  if (
    typeof mutable.discount_total === "number" &&
    Number.isFinite(mutable.discount_total) &&
    mutable.discount_total !== 0
  ) {
    mutable.discount_total = round2(mutable.discount_total * ratio)
  }
  if (typeof mutable.total === "number" && Number.isFinite(mutable.total)) {
    mutable.total = round2(mutable.total * ratio)
  }
}

export function applyDisplayPriceCorrectionToCart(cart: HttpTypes.StoreCart) {
  applyDisplayPriceCorrection(cart)
}

export function applyDisplayPriceCorrectionToOrder(order: HttpTypes.StoreOrder) {
  applyDisplayPriceCorrection(order)
}
