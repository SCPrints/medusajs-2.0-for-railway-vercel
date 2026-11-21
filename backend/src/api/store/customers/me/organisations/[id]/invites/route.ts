import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { inviteState } from "../../../../../../../lib/org-invites"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../lib/audit-log"
import { createInvite, publicInvite } from "../../../../../../../services/org-invites"
import { requireOwnerOr404 } from "./_owner"

/** GET /store/customers/me/organisations/:id/invites → { invites } still waiting. Non-owner / non-member: 404. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const m = await requireOwnerOr404(req)
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const rows = (await service.listOrganisationInvites({ organisation_id: m.organisation_id } as any, { take: 200, order: { created_at: "DESC" } })) as any[]
  res.json({ invites: rows.filter((i) => inviteState(i) === "pending").map(publicInvite) })
}

const body = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["owner", "purchaser", "viewer"]).default("purchaser"),
})

/**
 * POST /store/customers/me/organisations/:id/invites  { email, role }
 * Owners only (so only an owner can invite another owner). 201 { invite, sent }.
 * 400 bad body; 409 already a member / 20 waiting / sent 3 times; 404 non-owner.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const m = await requireOwnerOr404(req)
  const parsed = body.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address." })
  try {
    const { invite, sent } = await createInvite(req.scope, { organisation_id: m.organisation_id, invited_by: m.customer_id, ...parsed.data })
    await writeAudit({
      container: req.scope as any,
      entity: AUDIT_ENTITY.ORGANISATION,
      entity_id: m.organisation_id,
      action: AUDIT_ACTION.MEMBER_ADDED,
      actor_id: m.customer_id,
      details: { invite_id: invite.id, email: invite.email, role: invite.role, source: "portal_invite" },
    })
    return res.status(201).json({ invite: publicInvite(invite), sent })
  } catch (err: any) {
    if (err?.type === "not_allowed") return res.status(409).json({ error: err.message })
    throw err
  }
}
