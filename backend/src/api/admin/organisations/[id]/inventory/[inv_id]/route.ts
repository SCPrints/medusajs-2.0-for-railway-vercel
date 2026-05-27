import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { ORG_INVENTORY_MODULE } from "../../../../../../modules/org-inventory"
import type OrgInventoryModuleService from "../../../../../../modules/org-inventory/service"

const updateSchema = z.object({
  fulfillment_mode: z.enum(["held_stock", "print_on_demand"]).optional(),
  unit_price: z.number().int().nonnegative().optional(),
  unit_cost: z.number().int().nonnegative().optional(),
  reorder_point: z.number().int().nonnegative().nullable().optional(),
  reorder_quantity: z.number().int().nonnegative().nullable().optional(),
  lead_time_days: z.number().int().nonnegative().nullable().optional(),
  customer_facing_label: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
})

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
  const avail = await service.getAvailability(invId)
  res.json({ inventory: { ...row, ...avail } })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orgId = req.params.id
  const invId = req.params.inv_id
  let body: z.infer<typeof updateSchema>
  try {
    body = updateSchema.parse(req.body ?? {})
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
  const update: Record<string, unknown> = { id: invId }
  for (const key of Object.keys(body) as Array<keyof typeof body>) {
    if (body[key] !== undefined) (update as any)[key] = body[key]
  }
  await service.updateOrgInventories([update as any])
  const fresh = await service.retrieveOrgInventory(invId)
  res.json({ inventory: fresh })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const orgId = req.params.id
  const invId = req.params.inv_id
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
  await service.updateOrgInventories([
    { id: invId, is_active: false } as any,
  ])
  res.json({ ok: true })
}
