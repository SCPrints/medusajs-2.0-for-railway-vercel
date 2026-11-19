import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import { costCentreCreateSchema, zodMessage } from "../../../../../services/org-account/schemas"

/** POST /admin/organisations/:id/cost-centres  { code, name } → { cost_centre } (409 on a used code) */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = costCentreCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const existing = (await service.listOrganisationCostCentres(
    { organisation_id: req.params.id, code: parsed.data.code },
    { take: 1 }
  )) as any[]
  if (existing.length) return res.status(409).json({ error: `Cost centre ${parsed.data.code} already exists.` })
  const [created] = await service.createOrganisationCostCentres([
    { organisation_id: req.params.id, ...parsed.data },
  ])
  res.status(201).json({ cost_centre: created })
}
