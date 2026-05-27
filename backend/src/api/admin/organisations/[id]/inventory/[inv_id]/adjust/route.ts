import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { ORG_INVENTORY_MODULE } from "../../../../../../../modules/org-inventory"
import type OrgInventoryModuleService from "../../../../../../../modules/org-inventory/service"

const schema = z.object({
  target_quantity: z.number().int().nonnegative(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orgId = req.params.id
  const invId = req.params.inv_id
  let body: z.infer<typeof schema>
  try {
    body = schema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }
  const service =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)
  let existing: any
  try {
    existing = await service.retrieveOrgInventory(invId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (existing.organisation_id !== orgId) {
    return res.status(404).json({ error: "not_found" })
  }
  const movement = await service.adjust({
    org_inventory_id: invId,
    target_quantity: body.target_quantity,
    notes: body.notes ?? null,
    actor_id: (req as any).auth_context?.actor_id ?? null,
  })
  const fresh = await service.retrieveOrgInventory(invId)
  res.json({ inventory: fresh, movement })
}
