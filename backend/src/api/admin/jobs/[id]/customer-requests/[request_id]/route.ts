import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../lib/audit-log"
import { decideRequest, readRequests, REQUEST_STATUSES } from "../../../../../../lib/customer-requests"
import { mergeOrderMetadata } from "../../../../../../lib/order-metadata"

const schema = z.object({
  status: z.enum(REQUEST_STATUSES),
  staff_note: z.string().trim().max(1000).optional(),
})

/**
 * POST /admin/jobs/:id/customer-requests/:request_id { status, staff_note? }
 * Records staff's decision on a customer's problem / size-swap request. It does
 * not email the customer (staff use Reply) and changes nothing on the order.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" })
  const orders = req.scope.resolve(Modules.ORDER) as any
  const order = await orders.retrieveOrder(req.params.id, { select: ["id", "metadata"] }).catch(() => null)
  if (!order) return res.status(404).json({ error: "Order not found" })

  const next = decideRequest(readRequests(order.metadata), req.params.request_id, parsed.data.status, parsed.data.staff_note ?? null, new Date())
  if (!next) return res.status(404).json({ error: "Request not found" })
  await mergeOrderMetadata(req.scope, order.id, { customer_requests: next })

  const actor = (req as any).auth_context?.actor_id ?? "staff"
  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: order.id,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_id: actor,
    details: { kind: "customer_request_decided", request_id: req.params.request_id, status: parsed.data.status },
  })
  return res.json({ requests: next.slice().reverse() })
}
