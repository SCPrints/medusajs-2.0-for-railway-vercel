import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { CONTACT_NOTIFICATION_EMAIL } from "../../../../../lib/constants"
import { isTeamStoresEnabled } from "../../../../../lib/team-store"
import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { sendPlainEmail } from "../../../../../services/team-store/run"
import { verifyTeamStore } from "../../../../../services/team-store/sign"
import { findStoreByHandle, publicStoreView } from "../../../../../services/team-store/storefront"

/**
 * Organiser sign-off for the whole store (Decision 7), on a signed link
 * (`team-store-approve:<store id>`). GET shows every item; POST approves.
 */
async function load(req: MedusaRequest, sig: unknown) {
  if (!isTeamStoresEnabled()) return null
  const store = await findStoreByHandle(req.scope, req.params.handle)
  if (!store || !verifyTeamStore("approve", store.id, sig)) return null
  return store
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const store = await load(req, req.query.sig)
  if (!store) return res.status(404).json({ message: "Not found" })
  // The organiser checks every active, priced item before buyers can see it.
  const view = await publicStoreView(req.scope, store, { includeItems: true })
  res.json({ ...view, can_approve: store.status === "awaiting_approval" && !store.approved_at })
}

const schema = z.object({ sig: z.string().min(8).max(64), name: z.string().trim().min(2).max(120) })

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ message: "Please type your name to approve." })
  const store = await load(req, parsed.data.sig)
  if (!store) return res.status(404).json({ message: "Not found" })
  if (store.status !== "awaiting_approval") {
    return res.status(409).json({ message: "This store isn't waiting for approval any more." })
  }
  if (!store.approved_at) {
    const service = req.scope.resolve(TEAM_STORE_MODULE) as any
    await service.updateTeamStores({ id: store.id, approved_at: new Date(), approved_by_name: parsed.data.name })
    await writeAudit({
      container: req.scope,
      entity: AUDIT_ENTITY.TEAM_STORE,
      entity_id: store.id,
      action: AUDIT_ACTION.STATUS_CHANGED,
      actor_id: null,
      details: { approved_by_name: parsed.data.name },
    })
    await sendPlainEmail(
      req.scope,
      CONTACT_NOTIFICATION_EMAIL,
      `Team store approved: ${store.title}`,
      `${parsed.data.name} approved ${store.title}. Open it from the team store's page in admin (or it opens itself at its opening time).`
    )
  }
  res.json({ approved: true })
}
