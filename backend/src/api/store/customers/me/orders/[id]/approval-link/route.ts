import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { requireCustomer } from "../../../../../../../lib/require-customer"
import { buildApprovalUrl } from "../../../../../../../services/artwork-approval/proof-email"

/**
 * POST /store/customers/me/orders/:id/approval-link → { url }
 * The same signed link the proof email carries, for the order's owner to pass
 * to whoever signs artwork off. 404 for someone else's order; 409 when the
 * proof is not waiting on approval. Nothing is emailed from here.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireCustomer(req)
  const orders = req.scope.resolve(Modules.ORDER) as IOrderModuleService
  let order: any
  try {
    order = await orders.retrieveOrder(req.params.id)
  } catch {
    order = null
  }
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  }
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const url = meta.artwork_stage === "awaiting_approval" ? buildApprovalUrl(order.id, meta) : null
  if (!url) {
    return res.status(409).json({
      error: "not_awaiting_approval",
      message: "This proof isn't waiting on approval right now.",
    })
  }
  res.json({ url })
}
