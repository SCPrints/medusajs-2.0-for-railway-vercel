import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../modules/organisation"
import {
  purchaseOrderUpdateSchema,
  toDate,
  zodMessage,
} from "../../../../../../services/org-account/schemas"

/** POST /admin/organisations/:id/purchase-orders/:po_id  { number?, amount?, expires_at?, is_active? } */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = purchaseOrderUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [row] = (await service.listOrganisationPurchaseOrders(
    { id: req.params.po_id, organisation_id: req.params.id },
    { take: 1 }
  )) as any[]
  if (!row) return res.status(404).json({ error: "not_found" })
  const { expires_at, ...rest } = parsed.data
  const update: Record<string, unknown> = { id: row.id, ...rest }
  if (expires_at !== undefined) update.expires_at = toDate(expires_at)
  await service.updateOrganisationPurchaseOrders([update])
  res.json({ ok: true })
}
