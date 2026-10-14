import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService, IUserModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { writeAudit } from "../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import {
  PACKING_CHECK_KEY,
  isComplete,
  isValidKey,
  readPackingCheck,
} from "../../../../../lib/packing-check"

/**
 * Dispatch packing checklist (see lib/packing-check.ts). Each tick records
 * who + when; the order is stamped `completed_at/by` (and audited) the moment
 * the last box is ticked, and un-stamped if anything is unticked again.
 */

const tickSchema = z.object({
  key: z.string().min(1).max(200),
  checked: z.boolean(),
})

/** GET /admin/orders/:id/packing-check → PackingCheckState */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  try {
    const order = await orderModuleService.retrieveOrder(req.params.id)
    return res.json(readPackingCheck(order.metadata as Record<string, unknown>))
  } catch {
    return res.status(404).json({ error: "Order not found" })
  }
}

/** POST /admin/orders/:id/packing-check  body { key, checked } → PackingCheckState */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.id
  const parsed = tickSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message })

  const orderModuleService: IOrderModuleService = req.scope.resolve(Modules.ORDER)
  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, { relations: ["items"] })
  } catch {
    return res.status(404).json({ error: "Order not found" })
  }

  const lineIds: string[] = (order.items ?? []).map((i: any) => i.id)
  if (!isValidKey(parsed.data.key, lineIds)) {
    return res.status(400).json({ error: `Unknown checklist key: ${parsed.data.key}` })
  }

  const actorId: string | null = (req as any).auth_context?.actor_id ?? null
  let actorName: string | null = actorId
  if (actorId) {
    try {
      const userModule: IUserModuleService = req.scope.resolve(Modules.USER)
      const user = await userModule.retrieveUser(actorId)
      actorName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
    } catch {
      // keep the id
    }
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  const state = readPackingCheck(meta)
  const wasComplete = isComplete(state, lineIds)
  const ticks = { ...state.ticks }
  if (parsed.data.checked) {
    ticks[parsed.data.key] = { at: new Date().toISOString(), by: actorName }
  } else {
    delete ticks[parsed.data.key]
  }
  const next = { ...state, ticks }
  const nowComplete = isComplete(next, lineIds)
  if (nowComplete && !wasComplete) {
    next.completed_at = new Date().toISOString()
    next.completed_by = actorName
  } else if (!nowComplete) {
    next.completed_at = null
    next.completed_by = null
  }

  // Medusa replaces the whole metadata jsonb on update — spread existing keys.
  await orderModuleService.updateOrders(orderId, {
    metadata: { ...meta, [PACKING_CHECK_KEY]: next },
  })

  if (nowComplete && !wasComplete) {
    await writeAudit({
      container: req.scope,
      entity: AUDIT_ENTITY.ORDER,
      entity_id: orderId,
      action: AUDIT_ACTION.PACKING_CHECK_COMPLETED,
      actor_id: actorId,
      details: { completed_by: actorName },
    })
  }

  return res.json(next)
}
