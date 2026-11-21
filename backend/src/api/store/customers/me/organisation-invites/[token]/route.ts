import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import { isEmailVerified } from "../../../../../../lib/email-verification"
import { acceptCheck, ROLE_LABEL } from "../../../../../../lib/org-invites"
import { ORGANISATION_MODULE } from "../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../modules/organisation/service"
import { findPendingByToken } from "../../../../../../services/org-invites"

/**
 * GET /store/customers/me/organisation-invites/:token
 * → { organisation: {name}, email, role, role_label, problem: null | "wrong_email" | "unverified" }
 * 404 for an unknown, used, cancelled or expired link.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const invite = await findPendingByToken(req.scope, req.params.token)
  if (!invite) return res.status(404).json({ error: "Not found" })
  const customer: any = await (req.scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(req.auth_context.actor_id)
  const org: any = await (req.scope.resolve(ORGANISATION_MODULE) as OrganisationModuleService).retrieveOrganisation(invite.organisation_id)
  const check = acceptCheck(invite.email, { email: customer.email, verified: isEmailVerified(customer) })
  res.json({
    organisation: { name: org.name },
    email: invite.email,
    role: invite.role,
    role_label: ROLE_LABEL[invite.role as keyof typeof ROLE_LABEL],
    problem: check === "ok" ? null : check,
  })
}
