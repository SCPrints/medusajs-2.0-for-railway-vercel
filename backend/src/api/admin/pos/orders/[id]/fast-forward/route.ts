import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type {
  IEventBusModuleService,
  IOrderModuleService,
} from "@medusajs/framework/types"
import { z } from "zod"

import {
  planProductionStageChange,
  resolveTracksFromMeta,
} from "../../../../../../lib/production-stage"
import {
  STAGE_TRANSITION_NOT_ALLOWED,
  isTransitionNotAllowed,
} from "../../../../../../lib/production-stage-guard"
import { writeAudit } from "../../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../../lib/audit-entities"
import { captureEvent } from "../../../../../../lib/posthog"

const bodySchema = z.object({
  target: z.enum(["delivered", "shipped", "in_production"]).default("delivered"),
  note: z.string().max(500).optional(),
})

const POS_OVERRIDE_REASON = "POS fast-forward"

/**
 * POST /admin/pos/orders/:id/fast-forward
 *   body: { target?: "delivered" | "shipped" | "in_production", note? }
 *   → { ok: true, changed, applied: { artwork, blanks, production } }
 *
 * Single-shot "the customer is walking out the door with the goods"
 * shortcut. Plans all three tracks through `planProductionStageChange` so
 * history entries are appended and the state-machine guard runs as
 * `pos_fast_forward` with the standing override reason — artwork
 * pending → approved and production received → delivered are skipped steps
 * that only this actor (or an admin with a reason) may force. The default
 * target is `delivered` for stock-item pickup; `shipped` if the courier is
 * coming later; `in_production` to flag approved + blanks-in-hand on a
 * multi-day custom job.
 *
 * Idempotent: an order already at the target is a no-op (no events, so a
 * double click can't duplicate automation actions or audit rows — review
 * 3-6). The old code also wrote `blanks_stage: "blanks_arrived"`, which is
 * not a BLANKS_STAGES value; the planner writes `arrived`.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(req.body ?? {})
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "invalid" })
  }

  const actor = (req as any).auth_context?.actor_id ?? "system"
  const orderModule = req.scope.resolve(Modules.ORDER) as IOrderModuleService
  const eventBus = req.scope.resolve(Modules.EVENT_BUS) as IEventBusModuleService

  let order: any
  try {
    order = await orderModule.retrieveOrder(orderId)
  } catch {
    return res.status(404).json({ error: "order not found" })
  }

  const previous = (order.metadata ?? {}) as Record<string, unknown>
  const from = resolveTracksFromMeta(previous)
  const nowIso = new Date().toISOString()

  let plan
  try {
    plan = planProductionStageChange(
      previous,
      { artwork_stage: "approved", blanks_stage: "arrived", production_stage: body.target },
      {
        orderId,
        changedAt: nowIso,
        changedBy: actor,
        note: body.note ?? POS_OVERRIDE_REASON,
        actor: { kind: "pos_fast_forward", user_id: actor },
        override_reason: POS_OVERRIDE_REASON,
      }
    )
  } catch (err) {
    if (!isTransitionNotAllowed(err)) throw err
    return res.status(409).json({ error: STAGE_TRANSITION_NOT_ALLOWED, message: err.message })
  }

  const applied = {
    artwork: plan.metadata?.artwork_stage ?? from.artwork,
    blanks: plan.metadata?.blanks_stage ?? from.blanks,
    production: plan.metadata?.production_stage ?? from.downstream,
  }

  if (!plan.changed || !plan.metadata) {
    return res.json({ ok: true, changed: false, applied })
  }

  await orderModule.updateOrders([
    {
      id: orderId,
      metadata: {
        ...previous,
        ...plan.metadata,
        pos_fast_forwarded_at: nowIso,
        pos_fast_forwarded_target: body.target,
      },
    },
  ])

  // One event per track that actually moved, so subscribers (emails,
  // automation rules, audit) fire as if the stages had advanced one at a time.
  for (const e of plan.events) {
    try {
      await eventBus.emit({ name: e.name, data: e.data })
    } catch (err: any) {
      req.scope
        .resolve("logger")
        .error(`pos fast-forward: failed to emit ${e.name} for ${orderId}: ${err?.message ?? err}`)
    }
  }

  await writeAudit({
    container: req.scope as any,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: orderId,
    action: AUDIT_ACTION.STAGE_CHANGED,
    actor_id: actor,
    details: {
      source: "pos_fast_forward",
      target: body.target,
      from: { artwork: from.artwork, blanks: from.blanks, production: from.downstream },
      to: applied,
      override_reason: POS_OVERRIDE_REASON,
    },
  })

  try {
    captureEvent(actor, "pos_order_fast_forwarded", {
      order_id: orderId,
      target: body.target,
    })
  } catch {
    /* best-effort */
  }

  return res.json({ ok: true, changed: true, applied })
}
