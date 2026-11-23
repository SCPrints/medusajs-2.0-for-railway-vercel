import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { mergeOrderMetadata } from "../../../../../lib/order-metadata"
import { STALE_FLAG_KEYS, planProductionStageChange } from "../../../../../lib/production-stage"
import { emitStageEvents } from "../../../../../lib/stage-events"
import { TEAM_STORE_MODULE } from "../../../../../modules/team-store"
import { adminStoreView } from "../../../../../services/team-store/admin"
import { getRunSummary } from "../../../../../services/team-store/run"

/**
 * POST /admin/team-stores/:id/start-run
 *
 * The organiser approved every design once (Decision 7), so each order's
 * artwork is stamped `approved` here, with that approval as the recorded
 * reason (no per-order proof, no proof email). The artwork-approved
 * subscriber then sets each order's due date. Store → in_production.
 * Blanks and production then move with the bulk stage route.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(TEAM_STORE_MODULE) as any
  const store = await service.retrieveTeamStore(req.params.id)
  if (store.status !== "closed" && store.status !== "in_production") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Close the store before starting its run.")
  }
  if (!store.approved_at) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The store was never approved by the organiser.")

  const changedBy = (req as any).auth_context?.actor_id ?? null
  const changedAt = new Date().toISOString()
  const reason = `Team store "${store.title}" approved by ${store.approved_by_name ?? "the organiser"} on ${new Date(store.approved_at).toISOString().slice(0, 10)}`
  const orders = req.scope.resolve(Modules.ORDER) as any
  const { order_ids } = await getRunSummary(req.scope, store.id)

  let approved = 0
  const errors: string[] = []
  for (const orderId of order_ids) {
    try {
      const order = await orders.retrieveOrder(orderId, { select: ["id", "metadata"] })
      const plan = planProductionStageChange(
        order.metadata ?? {},
        { artwork_stage: "approved" },
        { orderId, changedAt, changedBy, note: reason, actor: { kind: "admin", user_id: changedBy }, override_reason: reason }
      )
      if (!plan.changed || !plan.metadata) continue
      const { production_stage_history: _h, ...patch } = plan.metadata
      await mergeOrderMetadata(req.scope, orderId, patch, {
        append: { production_stage_history: plan.historyEntries },
        unset: [...STALE_FLAG_KEYS],
      })
      await emitStageEvents(req.scope, orderId, plan.events)
      approved += 1
    } catch (err: any) {
      errors.push(`${orderId}: ${err?.message ?? err}`)
    }
  }

  if (store.status === "closed") await service.updateTeamStores({ id: store.id, status: "in_production" })
  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.TEAM_STORE,
    entity_id: store.id,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_id: changedBy,
    details: { to: "in_production", artwork_approved: approved, errors: errors.length },
  })
  res.json({ ...(await adminStoreView(req.scope, store.id)), approved, errors })
}
