import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ORG_INVENTORY_MODULE } from "../../../../../../../modules/org-inventory"
import type OrgInventoryModuleService from "../../../../../../../modules/org-inventory/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orgId = req.params.id
  const invId = req.params.inv_id
  const service =
    req.scope.resolve<OrgInventoryModuleService>(ORG_INVENTORY_MODULE)

  let row: any
  try {
    row = await service.retrieveOrgInventory(invId)
  } catch {
    return res.status(404).json({ error: "not_found" })
  }
  if (row.organisation_id !== orgId) {
    return res.status(404).json({ error: "not_found" })
  }
  const movements = await service.listOrgInventoryMovements(
    { org_inventory_id: invId },
    { take: 500, order: { created_at: "DESC" } }
  )
  res.json({ movements })
}
