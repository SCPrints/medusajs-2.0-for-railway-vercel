import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import {
  ROSTER_GARMENT_GROUPS,
  ROSTER_MAX_MEMBERS,
  cleanRosterMember,
  type RosterMemberInput,
} from "../../../../../../../lib/roster"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { requireMembership, requireRole } from "../../_helpers"

const EDIT_ROLES = ["owner", "purchaser"] as const

export const rosterRow = (m: any) => ({
  id: m.id as string,
  name: m.name as string,
  unit: (m.unit ?? null) as string | null,
  number: (m.number ?? null) as string | null,
  sizes: (m.sizes ?? {}) as Record<string, string>,
  notes: (m.notes ?? null) as string | null,
  is_active: m.is_active !== false,
})

const listRoster = async (service: OrganisationModuleService, organisationId: string) =>
  ((await service.listOrganisationRosterMembers(
    { organisation_id: organisationId } as any,
    { take: ROSTER_MAX_MEMBERS, order: { name: "ASC" } }
  )) as any[]).map(rosterRow)

const cleanMembers = (raw: unknown): RosterMemberInput[] => {
  const list = Array.isArray(raw) ? raw : []
  if (list.length > ROSTER_MAX_MEMBERS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A roster holds up to ${ROSTER_MAX_MEMBERS} people.`
    )
  }
  return list.map(cleanRosterMember).filter((m): m is RosterMemberInput => m !== null)
}

/**
 * GET /store/customers/me/organisations/:id/roster
 *   → { members: [{ id, name, unit, number, sizes, notes, is_active }],
 *       garment_groups: [{ key, label }], can_edit }
 * Any member may read it.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  res.json({
    members: await listRoster(service, membership.organisation_id),
    garment_groups: ROSTER_GARMENT_GROUPS,
    can_edit: (EDIT_ROLES as ReadonlyArray<string>).includes(membership.role),
  })
}

/**
 * POST /store/customers/me/organisations/:id/roster  { members: [{ name, unit?, number?, sizes?, notes? }] }
 *   → { members } (the whole roster). Adds people (owner / purchaser).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, EDIT_ROLES)
  const members = cleanMembers((req.body as any)?.members)
  if (members.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Add at least one person with a name.")
  }
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const existing = await listRoster(service, membership.organisation_id)
  if (existing.length + members.length > ROSTER_MAX_MEMBERS) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `A roster holds up to ${ROSTER_MAX_MEMBERS} people.`
    )
  }
  await service.createOrganisationRosterMembers(
    members.map((m) => ({ ...m, organisation_id: membership.organisation_id })) as any
  )
  res.status(201).json({ members: await listRoster(service, membership.organisation_id) })
}

/**
 * PUT /store/customers/me/organisations/:id/roster  { members: [...] }
 *   → { members }. Replaces the whole roster with the list sent (owner / purchaser).
 */
export async function PUT(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, EDIT_ROLES)
  if (!Array.isArray((req.body as any)?.members)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "members must be a list.")
  }
  const members = cleanMembers((req.body as any).members)
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const existing = await listRoster(service, membership.organisation_id)
  // Create first: if it fails the old roster is still there.
  if (members.length) {
    await service.createOrganisationRosterMembers(
      members.map((m) => ({ ...m, organisation_id: membership.organisation_id })) as any
    )
  }
  if (existing.length) {
    await service.softDeleteOrganisationRosterMembers(existing.map((m) => m.id))
  }
  res.json({ members: await listRoster(service, membership.organisation_id) })
}
