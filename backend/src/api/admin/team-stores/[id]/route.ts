import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../lib/audit-entities"
import { writeAudit } from "../../../../lib/audit-log"
import { TEAM_STORE_MODULE } from "../../../../modules/team-store"
import { MANUAL_STATUSES, adminStoreView, parseBody, storeBodySchema, storeFields } from "../../../../services/team-store/admin"

const updateSchema = storeBodySchema.partial().extend({ status: z.enum(MANUAL_STATUSES).optional() })

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  await service.retrieveTeamStore(req.params.id)
  res.json(await adminStoreView(req.scope, req.params.id))
}

/** Edit details, or move status by hand (draft / in_production / completed / cancelled). */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = parseBody(updateSchema, req.body)
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  const fields = await storeFields(req.scope, body, store.id)
  if (body.status && body.status !== store.status) {
    if (body.status === "draft" && !["awaiting_approval", "cancelled"].includes(store.status)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only a store awaiting approval (or cancelled) can go back to draft.")
    }
    if ((body.status === "in_production" || body.status === "completed") && !store.quote_id) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Close the store first.")
    }
    fields.status = body.status
    // Back to draft = the organiser has to approve again.
    if (body.status === "draft") fields.approved_at = null
  }
  await service.updateTeamStores({ id: store.id, ...fields })
  if (fields.status) {
    await writeAudit({
      container: req.scope,
      entity: AUDIT_ENTITY.TEAM_STORE,
      entity_id: store.id,
      action: AUDIT_ACTION.STATUS_CHANGED,
      actor_id: (req as any).auth_context?.actor_id ?? null,
      details: { from: store.status, to: fields.status },
    })
  }
  res.json(await adminStoreView(req.scope, store.id))
}

/** Only a draft with no orders can be deleted; anything else is cancelled. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  if (store.status !== "draft") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only a draft store can be deleted. Cancel it instead.")
  }
  const items = await service.listTeamStoreItems({ team_store_id: store.id }, { select: ["id"], take: 500 })
  if (items.length) await service.softDeleteTeamStoreItems(items.map((i: any) => i.id))
  await service.softDeleteTeamStores(store.id)
  res.json({ id: store.id, deleted: true })
}
