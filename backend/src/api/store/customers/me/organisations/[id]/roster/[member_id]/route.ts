import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { cleanRosterMember } from "../../../../../../../../lib/roster"
import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../../modules/organisation/service"
import { requireMembership, requireRole } from "../../../_helpers"
import { rosterRow } from "../route"

/** The roster row, only if it belongs to this organisation (else 404). */
async function loadRow(req: AuthenticatedMedusaRequest) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const rows = (await service.listOrganisationRosterMembers(
    { id: req.params.member_id, organisation_id: membership.organisation_id } as any,
    { take: 1 }
  )) as any[]
  if (!rows[0]) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Person not found.")
  return { service, row: rows[0] }
}

/**
 * POST /store/customers/me/organisations/:id/roster/:member_id
 *   { name, unit?, number?, sizes?, notes?, is_active? } → { member }
 * The whole row is sent (the table saves a row at a time). Owner / purchaser.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, row } = await loadRow(req)
  const clean = cleanRosterMember(req.body)
  if (!clean) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A name is required.")
  const updated = await service.updateOrganisationRosterMembers({ id: row.id, ...clean } as any)
  res.json({ member: rosterRow(updated) })
}

/** DELETE /store/customers/me/organisations/:id/roster/:member_id → { id, deleted: true } */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { service, row } = await loadRow(req)
  await service.softDeleteOrganisationRosterMembers([row.id])
  res.json({ id: row.id, deleted: true })
}
