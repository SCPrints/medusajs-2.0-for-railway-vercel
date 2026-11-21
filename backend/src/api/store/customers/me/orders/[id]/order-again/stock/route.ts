import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

import { variantAvailable } from "../../../../../../../../lib/search-product-document"
import { classifyReorderLines, lineTitle } from "../../../../../../../../lib/reorder-lines"
import { checkReorderStock, type StockLineInput, type StockVariant } from "../../../../../../../../lib/reorder-stock"
import { requireCustomer } from "../../../../../../../../lib/require-customer"
import { loadOwnOrder } from "../../../../../../../../services/reorder/load"

/**
 * GET /store/customers/me/orders/:id/order-again/stock
 *   → { lines: [{ line_item_id, title, variant_title, wanted, available, ok, suggestion? }] }
 * Stock the way the store API computes it (stocked minus reserved at the sales
 * channels' locations). Someone else's order → 404.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const order = await loadOwnOrder(req.scope, req.params.id, customerId)
  if (!order) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")

  const { design } = classifyReorderLines(order.items)
  const lines = design.filter((l) => l.variant_id && l.product_id)
  const productIds = [...new Set(lines.map((l) => l.product_id as string))]
  if (!productIds.length) return res.json({ lines: [] })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    filters: { id: productIds },
    fields: [
      "id",
      "options.id", "options.title", "options.values.value",
      "variants.id", "variants.title", "variants.manage_inventory", "variants.allow_backorder",
      "variants.options.value", "variants.options.option_id",
      "sales_channels.stock_locations.id",
      "variants.inventory_items.required_quantity",
      "variants.inventory_items.inventory.location_levels.location_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "variants.inventory_items.inventory.location_levels.reserved_quantity",
    ],
  })
  const products = new Map<string, any>((data ?? []).map((p: any) => [p.id, p]))

  const toStock = (v: any, locs: Set<string>): StockVariant => {
    const tracked = v.manage_inventory !== false && v.allow_backorder !== true
    return {
      id: v.id,
      title: v.title ?? "",
      options: Object.fromEntries((v.options ?? []).map((o: any) => [o.option_id, o.value])),
      available: tracked ? variantAvailable(v, locs) : null, // null = always ok
    }
  }

  const inputs: StockLineInput[] = lines.map((l) => {
    const p = products.get(l.product_id as string)
    const locs = new Set<string>(
      (p?.sales_channels ?? []).flatMap((c: any) => (c?.stock_locations ?? []).map((s: any) => s?.id))
    )
    const siblings: StockVariant[] = (p?.variants ?? []).map((v: any) => toStock(v, locs))
    const sizeOpt = (p?.options ?? []).find((o: any) => /size/i.test(o?.title ?? ""))
    return {
      line_item_id: l.id,
      title: lineTitle(l),
      variant_title: l.variant_title ?? null,
      variant_id: l.variant_id ?? null,
      wanted: l.quantity ?? 1,
      variant: siblings.find((s) => s.id === l.variant_id) ?? null,
      siblings,
      sizeOptionId: sizeOpt?.id ?? null,
      sizeOrder: (sizeOpt?.values ?? []).map((x: any) => x.value),
    }
  })

  res.json({ lines: checkReorderStock(inputs) })
}
