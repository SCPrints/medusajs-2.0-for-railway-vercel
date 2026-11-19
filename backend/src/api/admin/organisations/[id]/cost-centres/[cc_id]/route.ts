import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../modules/organisation"
import { costCentreUpdateSchema, zodMessage } from "../../../../../../services/org-account/schemas"

const find = async (req: MedusaRequest) => {
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [row] = (await service.listOrganisationCostCentres(
    { id: req.params.cc_id, organisation_id: req.params.id },
    { take: 1 }
  )) as any[]
  return { service, row }
}

/** POST /admin/organisations/:id/cost-centres/:cc_id  { code?, name?, is_active? } */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = costCentreUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) })
  const { service, row } = await find(req)
  if (!row) return res.status(404).json({ error: "not_found" })
  await service.updateOrganisationCostCentres([{ id: row.id, ...parsed.data }])
  res.json({ ok: true })
}

/** DELETE /admin/organisations/:id/cost-centres/:cc_id */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { service, row } = await find(req)
  if (row) await service.deleteOrganisationCostCentres([row.id])
  res.json({ ok: true })
}
