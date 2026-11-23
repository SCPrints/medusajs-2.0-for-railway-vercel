import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { adminStoreView } from "../../../../../services/team-store/admin"
import { assertStoreReady } from "../../../../../services/team-store/readiness"

/** POST /admin/team-stores/:id/open — needs the organiser's approval and a future closing date. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  if (store.status !== "awaiting_approval" && store.status !== "closed") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `The store is ${store.status}. Send it for approval first.`)
  }
  if (store.status === "closed" && store.quote_id) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This store already has a production run; start a new store instead.")
  }
  if (!store.approved_at) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The organiser hasn't approved the store yet.")
  if (new Date(store.closes_at).getTime() <= Date.now()) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The closing date has passed. Move it later first.")
  }
  await assertStoreReady(req.scope, store)
  await service.updateTeamStores({ id: store.id, status: "open", ...(store.opens_at && new Date(store.opens_at) > new Date() ? { opens_at: new Date() } : {}) })
  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.TEAM_STORE,
    entity_id: store.id,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_id: (req as any).auth_context?.actor_id ?? null,
    details: { from: store.status, to: "open" },
  })
  res.json(await adminStoreView(req.scope, store.id))
}
