import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { allowanceClosed } from "../../../../../../../../../lib/allowance"
import { loadAllowance, newAllowanceToken, orgService } from "../../../../../../../../../services/org-allowance"
import { requireMembership, requireRole } from "../../../../_helpers"
import { parseBody } from "../../../range/_schema"

/**
 * POST /store/customers/me/organisations/:id/allowances/:aid/people  { roster_member_id }
 *   → 201 { token }   (owner / purchaser)
 * New-starter packs: give one more person on the roster their own link. Only
 * ongoing, open allowances; the person must be active on THIS organisation's
 * roster and not already have a link (then their existing token comes back).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const { roster_member_id } = parseBody(z.object({ roster_member_id: z.string().min(1).max(80) }), req.body)
  const a = await loadAllowance(req.scope, membership.organisation_id, req.params.aid)
  if (a.kind !== "ongoing") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only new-starter packs take people one at a time.")
  if (allowanceClosed(a)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This pack is closed. Open it again first.")

  const service = orgService(req.scope)
  const [person] = (await service.listOrganisationRosterMembers(
    { id: roster_member_id, organisation_id: membership.organisation_id, is_active: true } as any,
    { take: 1 }
  )) as any[]
  if (!person) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That person isn't on your roster.")

  const [existing] = (await service.listOrganisationAllowancePicks(
    { allowance_id: a.id, roster_member_id } as any,
    { take: 1 }
  )) as any[]
  if (existing) return res.status(200).json({ token: existing.token })

  const token = newAllowanceToken()
  await service.createOrganisationAllowancePicks([{ allowance_id: a.id, roster_member_id, token, picks: [] } as any])
  res.status(201).json({ token })
}
