import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { inviteState } from "../../../../../../../../../lib/org-invites"
import { ORGANISATION_MODULE } from "../../../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../../../modules/organisation/service"
import { publicInvite, resendInvite } from "../../../../../../../../../services/org-invites"
import { requireOwnerOr404 } from "../../_owner"

/** POST …/invites/:invite_id/resend → { invite, sent }. 404 unless owner and waiting; 403 after the third send. */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const m = await requireOwnerOr404(req)
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const [invite] = (await service.listOrganisationInvites({ id: req.params.invite_id, organisation_id: m.organisation_id } as any, { take: 1 })) as any[]
  if (!invite || inviteState(invite) !== "pending") return res.status(404).json({ error: "Not found" })
  const result = await resendInvite(req.scope, invite)
  res.json({ invite: publicInvite(result.invite), sent: result.sent })
}
