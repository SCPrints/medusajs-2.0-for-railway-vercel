import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { requireCustomer } from "../../../../../lib/require-customer"

/**
 * GET /store/customers/me/usual-garments → { garments: [{ handle, title, thumbnail }] }
 *
 * The garments this customer has ordered before, most recent first (max 12)
 * — they lead the garment picker. Published catalogue garments only: setup
 * fees and other hidden service products are left out.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const pg = req.scope.resolve<any>("__pg_connection__")
  const { rows } = await pg.raw(
    `select li.product_id, max(o.created_at) as last_ordered
       from "order" o
       join order_item oi on oi.order_id = o.id and oi.deleted_at is null
       join order_line_item li on li.id = oi.item_id and li.deleted_at is null
      where o.customer_id = ? and o.deleted_at is null and o.canceled_at is null
        and li.product_id is not null
      group by li.product_id
      order by last_ordered desc
      limit 40`,
    [customerId]
  )
  const ids = (rows as Array<{ product_id: string }>).map((r) => r.product_id)
  if (ids.length === 0) return res.json({ garments: [] })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    filters: { id: ids },
    fields: ["id", "handle", "title", "thumbnail", "status", "metadata"],
  })
  const byId = new Map(
    ((data ?? []) as Array<{ id: string; handle?: string; title?: string; thumbnail?: string | null; status?: string; metadata?: Record<string, unknown> | null }>)
      .filter((p) => p.status === "published" && p.handle && p.metadata?.internal_service !== true)
      .map((p) => [p.id, { handle: p.handle as string, title: p.title ?? "", thumbnail: p.thumbnail ?? null }])
  )
  res.json({
    garments: ids.map((id) => byId.get(id)).filter((g): g is NonNullable<typeof g> => !!g).slice(0, 12),
  })
}
