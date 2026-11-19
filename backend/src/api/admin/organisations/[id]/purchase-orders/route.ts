import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import {
  purchaseOrderCreateSchema,
  toDate,
  zodMessage,
} from "../../../../../services/org-account/schemas"

/** POST /admin/organisations/:id/purchase-orders  { number, amount, expires_at? } → { purchase_order } */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = purchaseOrderCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [created] = await service.createOrganisationPurchaseOrders([
    {
      organisation_id: req.params.id,
      number: parsed.data.number,
      amount: parsed.data.amount,
      expires_at: toDate(parsed.data.expires_at) ?? null,
    },
  ])
  res.status(201).json({ purchase_order: created })
}
