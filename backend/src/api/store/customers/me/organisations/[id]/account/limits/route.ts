import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"

import { money } from "../../../../../../../../lib/org-account"
import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import { customersById, loadOrgOrders } from "../../../../../../../../services/org-account"
import { summariseOrgOrders } from "../../../../../../../../lib/org-account"
import { zodMessage } from "../../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../../_helpers"

/**
 * GET /store/customers/me/organisations/:id/account/limits
 *   → { members: [{ member_id, customer_id, name, email, role, order_limit, monthly_limit, month_spend }] }
 * Owner only.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const members = (await service.listOrganisationMembers(
    { organisation_id: membership.organisation_id },
    { take: 500 }
  )) as any[]
  const [people, orders] = await Promise.all([
    customersById(req.scope, members.map((m) => m.customer_id)),
    loadOrgOrders(req.scope, membership.organisation_id),
  ])
  const spend = summariseOrgOrders(orders, new Date()).month_spend
  res.json({
    members: members.map((m) => ({
      member_id: m.id,
      customer_id: m.customer_id,
      name: people[m.customer_id]?.name ?? "Member",
      email: people[m.customer_id]?.email ?? null,
      role: m.role,
      order_limit: money(m.order_limit),
      monthly_limit: money(m.monthly_limit),
      month_spend: spend[m.customer_id] ?? 0,
    })),
  })
}

const limit = z.coerce.number().positive().max(10_000_000).nullable()
const bodySchema = z.object({
  member_id: z.string().min(1),
  order_limit: limit,
  monthly_limit: limit,
})

/**
 * POST /store/customers/me/organisations/:id/account/limits
 *   { member_id, order_limit, monthly_limit }   (AUD inc GST; null = no limit)
 * Owner only.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [row] = (await service.listOrganisationMembers(
    { id: parsed.data.member_id, organisation_id: membership.organisation_id },
    { take: 1 }
  )) as any[]
  if (!row) return res.status(404).json({ error: "not_found", message: "not_found" })
  await service.updateOrganisationMembers([
    { id: row.id, order_limit: parsed.data.order_limit, monthly_limit: parsed.data.monthly_limit },
  ])
  res.json({ ok: true })
}
