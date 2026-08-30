import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  ProductStatus,
  QueryContext,
} from "@medusajs/framework/utils"
import { z } from "zod"

import { fetchOrdersForReports } from "../../../../lib/reports/orders"

/**
 * GET /store/products/top-selling
 *
 * Returns the top-N products by line-item count over the last N days.
 *
 * Query params:
 *  - days   (default 30, range 1–365) — rolling window in days
 *  - limit  (default 3, range 1–24)   — number of products to return
 *  - region_id (optional)             — when supplied, products are returned
 *                                       with `variants.calculated_price` in
 *                                       that region's currency, so storefront
 *                                       cards can show "From $X" directly.
 *
 * Used by the storefront menu's "Best Sellers" panel. Defensively built —
 * filters canceled orders, falls back to empty array if the orders fetch
 * fails. The orders scan is capped at 5000 rows via the shared helper, so
 * once volume exceeds that a materialised view becomes worth the work.
 *
 * Response shape mirrors `/store/brands/[handle]/products` so the storefront
 * can reuse its existing card components.
 */

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  limit: z.coerce.number().int().min(1).max(24).optional().default(3),
  region_id: z.string().optional(),
})

const STORE_PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "handle",
  "thumbnail",
  "type_id",
  "type.*",
  "metadata",
  "variants.id",
  "variants.title",
  "variants.calculated_price.*",
  "variants.inventory_quantity",
  "options.*",
  "options.values.*",
  "tags.*",
  "images.*",
]

type OrderRow = {
  id: string
  status?: string
  created_at?: string
  items?: Array<{
    product_id?: string | null
    quantity?: number | null
  }>
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const q = querySchema.parse(req.query ?? {})
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any

  const windowFromTs = Date.now() - q.days * 24 * 60 * 60 * 1000

  let orders: OrderRow[] = []
  try {
    orders = (await fetchOrdersForReports(query)) as OrderRow[]
  } catch (err: any) {
    logger.error?.(
      `[products/top-selling] order fetch failed: ${err?.message ?? err}`
    )
    res.json({ products: [], count: 0 })
    return
  }

  // Aggregate sold quantity per product_id within the window. Quantity (not row
  // count) better reflects "best selling" — a single order of 50 tees should
  // weigh more than 50 single-item orders.
  const qtyByProductId = new Map<string, number>()
  for (const order of orders) {
    if (!order || order.status === "canceled") continue
    const createdMs = order.created_at ? new Date(order.created_at).getTime() : NaN
    if (!Number.isFinite(createdMs) || createdMs < windowFromTs) continue
    for (const item of order.items ?? []) {
      const productId = item?.product_id
      if (typeof productId !== "string" || !productId) continue
      const qty = typeof item.quantity === "number" ? item.quantity : 1
      qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + qty)
    }
  }

  if (qtyByProductId.size === 0) {
    res.json({ products: [], count: 0 })
    return
  }

  // Overfetch so hidden service products (setup fees — metadata.internal_service,
  // present on many orders so they'd otherwise rank) can be dropped post-fetch
  // while still filling `limit` slots with real garments.
  const rankedProductIds = Array.from(qtyByProductId.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, q.limit + 8)
    .map(([id]) => id)

  // Fetch full product data with region-aware pricing. Mirrors the pattern in
  // /store/brands/[handle]/products so storefront can render cards identically.
  //
  // Sales-channel scoping: the previous implementation passed
  //   filters.sales_channels = { id: salesChannelIds }
  // which Medusa 2.x rejects with "Trying to query by not existing property
  // Product.sales_channels" because sales channels are a module link, not a
  // direct product property. The failing query crashed the route and returned
  // 500s on every page render (observed 2026-05-25 in the Fly logs). Until the
  // correct module-link traversal is wired up, scope by the published-status
  // filter only — the rail returns top sellers regardless of channel, which is
  // acceptable for a single-storefront deployment (only one sales channel in
  // play). TODO: route sales-channel scoping through the link table.
  const filters: Record<string, any> = {
    id: rankedProductIds,
    status: ProductStatus.PUBLISHED,
  }

  const context: Record<string, any> = {}
  if (q.region_id) {
    const regionRes = await query.graph({
      entity: "region",
      fields: ["id", "currency_code"],
      filters: { id: q.region_id },
      pagination: { take: 1, skip: 0 },
    })
    const region = (regionRes.data ?? [])[0]
    if (region) {
      context.variants = {
        calculated_price: QueryContext({
          region_id: region.id,
          currency_code: region.currency_code,
        }),
      }
    }
  }

  // Defensive: per the route's design intent ("returns empty on any error so
  // the rail doesn't break the page") the product fetch should never propagate
  // a 500. The orders fetch above is already wrapped — extend the same shield
  // to the product fetch so a future schema change (e.g. a renamed field in
  // STORE_PRODUCT_FIELDS) degrades gracefully rather than breaking every page.
  let products: unknown[] = []
  try {
    const result = await query.graph({
      entity: "product",
      fields: STORE_PRODUCT_FIELDS,
      filters,
      pagination: { take: rankedProductIds.length, skip: 0 },
      context,
    })
    products = result.data ?? []
  } catch (err: any) {
    logger.error?.(
      `[products/top-selling] product fetch failed: ${err?.message ?? err}`
    )
    res.json({ products: [], count: 0 })
    return
  }

  // query.graph result order isn't guaranteed to match rankedProductIds — reorder
  // so the response respects the actual best-seller ranking.
  const productsById = new Map<string, any>()
  for (const p of products) {
    const row = p as { id?: string } | null
    if (row?.id) productsById.set(row.id, row)
  }
  const ordered = rankedProductIds
    .map((id) => productsById.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .filter((p) => (p as any)?.metadata?.internal_service !== true)
    .slice(0, q.limit)

  res.json({
    products: ordered,
    count: ordered.length,
  })
}
