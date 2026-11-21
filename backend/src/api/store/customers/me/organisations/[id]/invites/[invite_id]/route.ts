import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { inviteState } from "../../../../../../../../lib/org-invites"
import { ORGANISATION_MODULE } from "../../../../../../../../modules/organisation"
import type OrganisationModuleService from "../../../../../../../../modules/organisation/service"
import { requireOwnerOr404 } from "../_owner"

/** DELETE /store/customers/me/organisations/:id/invites/:invite_id → cancel the invitation. 404 unless owner and it is waiting. */
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const m = await requireOwnerOr404(req)
  const service = req.scope.resolve<OrganisationModuleService>(ORGANISATION_MODULE)
  const [invite] = (await service.listOrganisationInvites({ id: req.params.invite_id, organisation_id: m.organisation_id } as any, { take: 1 })) as any[]
  if (!invite || inviteState(invite) !== "pending") return res.status(404).json({ error: "Not found" })
  await service.updateOrganisationInvites([{ id: invite.id, revoked_at: new Date() }])
  res.json({ ok: true })
}
