import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { requireCustomer } from "../../../../../../../lib/require-customer"
import { decideProof } from "../../../../../../../services/artwork-approval/decide"
import { buildProofPayload } from "../../../../../../../services/artwork-approval/proof-payload"

const bodySchema = z.object({
  approved: z.boolean(),
  approver_name: z.string().trim().max(200).optional(),
  comment: z.string().trim().max(2000).optional(),
  pins: z.array(z.unknown()).max(20).optional(),
})

// ponytail: customer-only. Organisation members do not see each other's proofs
// here; add the org-role check from customer-org-sharing if buyers ask for it.
async function loadMyOrder(req: AuthenticatedMedusaRequest, withItems: boolean) {
  const customerId = requireCustomer(req)
  const orders = req.scope.resolve(Modules.ORDER) as IOrderModuleService
  let order: any
  try {
    order = await orders.retrieveOrder(req.params.id, withItems ? { relations: ["items"] } : undefined)
  } catch {
    order = null
  }
  // Someone else's order is a 404, never a 403.
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  }
  return order
}

/**
 * GET /store/customers/me/orders/:id/proof
 *   → the same payload as GET /store/artwork-approval, plus `waiting`
 *     (true while the proof is out for the customer's answer).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const order = await loadMyOrder(req, true)
  const payload = buildProofPayload(order)
  res.json({ ...payload, waiting: payload.artwork_stage === "awaiting_approval" })
}

/**
 * POST /store/customers/me/orders/:id/proof
 *   body { approved, approver_name?, comment?, pins? } → { ok, status }
 *   409 when the proof is not waiting on an answer.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Check your answer and try again.")
  }
  const order = await loadMyOrder(req, false)
  const result = await decideProof(req.scope, order, parsed.data, "customer_account")
  if ("httpStatus" in result) {
    return res.status(result.httpStatus).json({ error: result.error, message: result.message })
  }
  res.json({ ok: true, status: result.status })
}
