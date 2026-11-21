import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { readRequests } from "../../../../../lib/customer-requests"

/** GET /admin/jobs/:id/customer-requests → { requests } (newest first). The job id is the order id; 404 when there is no such order. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orders = req.scope.resolve(Modules.ORDER) as any
  const order = await orders.retrieveOrder(req.params.id, { select: ["id", "metadata"] }).catch(() => null)
  if (!order) return res.status(404).json({ error: "Order not found" })
  return res.json({ requests: readRequests(order.metadata).slice().reverse() })
}
