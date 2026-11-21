import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { readRequests } from "../../../../../../../lib/customer-requests"
import { requireOwnOrder } from "../../../../../../../services/customer-portal/requests"

/** GET /store/customers/me/orders/:id/requests → { requests: CustomerRequest[] (newest first), lines: [{ id, title, variant_title, quantity }] } for the forms. Someone else's order: 404. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { order } = await requireOwnOrder(req)
  const lines = order.items
    .filter((i) => !/\b(setup|set-up|vectori[sz]ation)\b/i.test(i.title ?? ""))
    .map((i) => ({ id: i.id, title: i.product_title ?? i.title ?? "Item", variant_title: i.variant_title, quantity: i.quantity }))
  return res.json({ requests: readRequests(order.metadata).slice().reverse(), lines })
}
