import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { PORTAL_MESSAGE_ACTOR_PREFIX, portalMessageBody, visibleMessages } from "../../../../../../../lib/job-messages"
import { ADMIN_WORKSPACE_MODULE } from "../../../../../../../modules/admin-workspace"
import { raiseAttention } from "../../../../../../../services/attention/notify"
import { bustTodayCache } from "../../../../../../../services/jobs/today"
import { orderLabel, requireOwnOrder } from "../../../../../../../services/customer-portal/requests"

const bodySchema = z.object({ text: z.string().trim().min(1).max(4000) })
const PER_HOUR = 20

/**
 * GET /store/customers/me/orders/:id/messages → { messages: [{ id, at, from: "you" | "staff", text }] }
 * Only what this customer wrote plus emails staff sent them (job-messages.ts).
 * Someone else's order: 404.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { customerId, order } = await requireOwnOrder(req)
  const pg = req.scope.resolve<any>("__pg_connection__")
  const { rows } = await pg.raw(
    `select id, body, created_by, created_at from order_comment
      where order_id = ? and deleted_at is null order by created_at desc limit 500`,
    [order.id]
  )
  return res.json({ messages: visibleMessages(rows ?? [], { customerId, customerEmail: order.email }) })
}

/**
 * POST /store/customers/me/orders/:id/messages { text } → { ok: true }
 * Lands in the job diary like an inbound customer email and flags the job
 * (customer_reply). Nothing is emailed to the customer. 20 per order per hour.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { customerId, order } = await requireOwnOrder(req)
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Write a message of up to 4000 characters.")

  const pg = req.scope.resolve<any>("__pg_connection__")
  const actor = `${PORTAL_MESSAGE_ACTOR_PREFIX}${customerId}`
  const { rows } = await pg.raw(
    `select count(*)::int as n from order_comment
      where order_id = ? and created_by = ? and created_at > now() - interval '1 hour' and deleted_at is null`,
    [order.id, actor]
  )
  if ((rows?.[0]?.n ?? 0) >= PER_HOUR) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "That's a lot of messages. Please wait a little, or email us.")
  }

  const body = portalMessageBody(order.email, parsed.data.text)
  await (req.scope.resolve(ADMIN_WORKSPACE_MODULE) as any).createOrderComments({ order_id: order.id, body, created_by: actor })
  await raiseAttention(req.scope, {
    kind: "customer_reply",
    order_id: order.id,
    customer_id: customerId,
    label: orderLabel(order),
    from: order.email,
    subject: "Message from the order page",
    excerpt: parsed.data.text,
  })
  bustTodayCache()
  return res.status(201).json({ ok: true })
}
