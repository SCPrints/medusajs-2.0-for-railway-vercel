import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import { costCentreCreateSchema, zodMessage } from "../../../../../../../services/org-account/schemas"
import { requireMembership, requireRole } from "../../_helpers"

/**
 * GET /store/customers/me/organisations/:id/cost-centres
 *   → { cost_centres: [{ id, code, name, is_active }] }
 * Any member.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const rows = (await service.listOrganisationCostCentres(
    { organisation_id: membership.organisation_id },
    { take: 500, order: { code: "ASC" } }
  )) as any[]
  res.json({
    cost_centres: rows.map((c) => ({ id: c.id, code: c.code, name: c.name, is_active: c.is_active !== false })),
  })
}

/**
 * POST /store/customers/me/organisations/:id/cost-centres   { code, name }
 * Owner only. 409 when the code is already used.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner"])
  const parsed = costCentreCreateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), message: zodMessage(parsed.error) })
  const service = req.scope.resolve(ORGANISATION_MODULE) as any
  const existing = (await service.listOrganisationCostCentres(
    { organisation_id: membership.organisation_id, code: parsed.data.code },
    { take: 1 }
  )) as any[]
  if (existing.length) return res.status(409).json({ error: `Cost centre ${parsed.data.code} already exists.`, message: `Cost centre ${parsed.data.code} already exists.` })
  const [created] = await service.createOrganisationCostCentres([
    { organisation_id: membership.organisation_id, ...parsed.data },
  ])
  res.status(201).json({ cost_centre: created })
}
