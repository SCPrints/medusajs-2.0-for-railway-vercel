import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../../../lib/audit-log"
import { isEmailVerified } from "../../../../../../../lib/email-verification"
import { acceptCheck } from "../../../../../../../lib/org-invites"
import { ORGANISATION_MODULE } from "../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../modules/organisation/service"
import { findPendingByToken } from "../../../../../../../services/org-invites"
import { applyOrganisationTier } from "../../../../../../../services/organisation-tier"

/**
 * POST /store/customers/me/organisation-invites/:token/accept
 * 200 { ok: true, organisation_id }. 404 unknown / used / cancelled / expired link.
 * 403 { code: "wrong_email" | "unverified" } when this account is not the invited,
 * email-confirmed one.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const invite = await findPendingByToken(req.scope, req.params.token)
  if (!invite) return res.status(404).json({ error: "Not found" })
  const customerId = req.auth_context.actor_id
  const customer: any = await (req.scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(customerId)
  const check = acceptCheck(invite.email, { email: customer.email, verified: isEmailVerified(customer) })
  if (check !== "ok") {
    return res.status(403).json({
      code: check,
      error: check === "wrong_email" ? `This invitation was sent to ${invite.email}. Sign in with that address.` : "Confirm your email first, then open the link again.",
    })
  }
  const service = req.scope.resolve(ORGANISATION_MODULE) as OrganisationModuleService
  const existing = (await service.listOrganisationMembers({ organisation_id: invite.organisation_id, customer_id: customerId } as any, { take: 1 })) as any[]
  let memberId = existing[0]?.id
  if (!memberId) {
    const [created] = (await service.createOrganisationMembers([
      { organisation_id: invite.organisation_id, customer_id: customerId, role: invite.role, invited_by: invite.invited_by, accepted_at: new Date() },
    ])) as any[]
    memberId = created.id
  }
  await service.updateOrganisationInvites([{ id: invite.id, accepted_at: new Date() }])
  await applyOrganisationTier(req.scope as any, invite.organisation_id, [customerId])
  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORGANISATION,
    entity_id: invite.organisation_id,
    action: AUDIT_ACTION.MEMBER_ADDED,
    actor_id: customerId,
    details: { customer_id: customerId, role: invite.role, member_id: memberId, invite_id: invite.id, source: "invite_accepted" },
  })
  res.json({ ok: true, organisation_id: invite.organisation_id })
}
