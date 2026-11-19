import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import { loadOrgAccount } from "../../../../../../../services/org-account"
import {
  purchaseOrderCreateSchema,
  toDate,
  zodMessage,
} from "../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/:id/purchase-orders
 *   → { purchase_orders: [{ id, number, amount, drawn, remaining, expires_at, is_active, expired }] }
 * Any member.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const account = await loadOrgAccount(req.scope, membership.organisation_id)
  res.json({ purchase_orders: account.purchase_orders })
}

/**
 * POST /store/customers/me/organisations/:id/purchase-orders
 *   { number, amount, expires_at? }  → { purchase_order }
 * Owner only.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const parsed = purchaseOrderCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [created] = await service.createOrganisationPurchaseOrders([
    {
      organisation_id: membership.organisation_id,
      number: parsed.data.number,
      amount: parsed.data.amount,
      expires_at: toDate(parsed.data.expires_at) ?? null,
    },
  ])
  res.status(201).json({ purchase_order: created })
}
