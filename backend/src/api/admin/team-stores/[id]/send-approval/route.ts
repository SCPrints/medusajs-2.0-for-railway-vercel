import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { ORGANISATION_MODULE } from "../../../../../modules/organisation"
import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { adminStoreView, parseBody } from "../../../../../services/team-store/admin"
import { assertStoreReady } from "../../../../../services/team-store/readiness"
import { sendPlainEmail, storeUrl } from "../../../../../services/team-store/run"
import { signTeamStore } from "../../../../../services/team-store/sign"

const schema = z.object({
  /** Who approves; defaults to the organisation's contact email. */
  email: z.string().email().optional(),
  /** false = just make the link (staff send it themselves). */
  send_email: z.boolean().default(true),
})

/**
 * POST /admin/team-stores/:id/send-approval — the organiser approves the
 * whole store once (Decision 7). Status → awaiting_approval; returns the
 * signed approval link and emails it unless send_email is false.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = parseBody(schema, req.body)
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  if (!["draft", "awaiting_approval"].includes(store.status)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `The store is ${store.status}; approval is before it opens.`)
  }
  await assertStoreReady(req.scope, store)

  const org = await (req.scope.resolve(ORGANISATION_MODULE) as any).retrieveOrganisation(store.organisation_id).catch(() => null)
  const to = body.email ?? org?.contact_email ?? null
  const url = `${storeUrl(store.handle)}/approve?sig=${signTeamStore("approve", store.id)}`

  await service.updateTeamStores({
    id: store.id,
    status: "awaiting_approval",
    approved_at: null,
    approved_by_name: null,
    metadata: { ...(store.metadata ?? {}), approval_sent_at: new Date().toISOString(), approval_sent_to: to },
  })
  const emailed =
    body.send_email &&
    (await sendPlainEmail(
      req.scope,
      to,
      `Please check your team store: ${store.title}`,
      `Here is your team store before it opens. Please check every item (garment, colour, artwork and price):\n\n${url}\n\nIf it all looks right, press Approve on that page. If anything needs changing, just reply to this email.`
    ))
  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.TEAM_STORE,
    entity_id: store.id,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_id: (req as any).auth_context?.actor_id ?? null,
    details: { from: store.status, to: "awaiting_approval", approval_sent_to: to, emailed: !!emailed },
  })
  res.json({ ...(await adminStoreView(req.scope, store.id)), approval_url: url, emailed: !!emailed })
}
