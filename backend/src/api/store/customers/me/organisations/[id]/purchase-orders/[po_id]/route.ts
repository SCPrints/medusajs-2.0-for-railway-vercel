import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import {
  purchaseOrderUpdateSchema,
  toDate,
  zodMessage,
} from "../../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../../_helpers"

/**
 * POST /store/customers/me/organisations/:id/purchase-orders/:po_id
 *   { number?, amount?, expires_at?, is_active? }
 * Owner only. Close a PO with `is_active: false` (orders already drawn on it
 * keep pointing at it, so there is no delete).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const parsed = purchaseOrderUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [row] = (await service.listOrganisationPurchaseOrders(
    { id: req.params.po_id, organisation_id: membership.organisation_id },
    { take: 1 }
  )) as any[]
  if (!row) return res.status(404).json({ error: "not_found", message: "not_found" })
  const { expires_at, ...rest } = parsed.data
  const update: Record<string, unknown> = { id: row.id, ...rest }
  if (expires_at !== undefined) update.expires_at = toDate(expires_at)
  await service.updateOrganisationPurchaseOrders([update])
  res.json({ ok: true })
}
