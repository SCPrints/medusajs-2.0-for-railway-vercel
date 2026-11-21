import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import { buildProofPayload } from "../../../../../services/artwork-approval/proof-payload"

/** GET /admin/orders/:id/proof-pins → the proof as the customer saw it, with their last change-request pins. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orders = req.scope.resolve(Modules.ORDER) as IOrderModuleService
  const order = await orders.retrieveOrder(req.params.id, { relations: ["items"] })
  const meta = (order.metadata ?? {}) as Record<string, unknown>
  res.json({
    ...buildProofPayload(order),
    approver_comment: typeof meta.artwork_approver_comment === "string" ? meta.artwork_approver_comment : null,
    change_comment: typeof meta.artwork_changes_requested_comment === "string" ? meta.artwork_changes_requested_comment : null,
  })
}
