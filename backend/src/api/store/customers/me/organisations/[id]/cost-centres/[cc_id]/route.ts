import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import { costCentreUpdateSchema, zodMessage } from "../../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../../_helpers"

const find = async (req: AuthenticatedMedusaRequest, orgId: string) => {
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const [row] = (await service.listOrganisationCostCentres(
    { id: req.params.cc_id, organisation_id: orgId },
    { take: 1 }
  )) as any[]
  return { service, row }
}

/**
 * POST /store/customers/me/organisations/:id/cost-centres/:cc_id
 *   { code?, name?, is_active? }      Owner only.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const parsed = costCentreUpdateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const { service, row } = await find(req, membership.organisation_id)
  if (!row) return res.status(404).json({ error: "not_found", message: "not_found" })
  await service.updateOrganisationCostCentres([{ id: row.id, ...parsed.data }])
  res.json({ ok: true })
}

/** DELETE …/cost-centres/:cc_id — owner only. Past orders keep their code. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const { service, row } = await find(req, membership.organisation_id)
  if (row) await service.deleteOrganisationCostCentres([row.id])
  res.json({ ok: true })
}
