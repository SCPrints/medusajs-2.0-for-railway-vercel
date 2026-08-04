import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IOrderModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { z } from "zod"

import { writeAudit } from "../../../../../lib/audit-log"
import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"

const bodySchema = z.object({
  order_id: z.string().min(1),
  // Put the order back in the pending queue.
  undo: z.boolean().optional(),
  note: z.string().max(500).optional(),
})

/**
 * POST /admin/dropship/ascolour/in-house
 *
 * Marks an order as fulfilled from SC Prints' own stock so it leaves the
 * pending AS Colour queue without ever being submitted to AS Colour.
 * Reversible — `undo: true` clears the stamp and the order returns to Pending.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = bodySchema.parse(req.body ?? {})
  const orderModuleService = req.scope.resolve<IOrderModuleService>(Modules.ORDER)

  let order: any
  try {
    order = await orderModuleService.retrieveOrder(body.order_id)
  } catch {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order "${body.order_id}" was not found.`
    )
  }

  const meta = (order.metadata ?? {}) as Record<string, any>
  if (meta.ascolour_order_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Order already sent to AS Colour as ${meta.ascolour_order_id}.`
    )
  }

  const actor =
    (req as any).auth_context?.actor_id ??
    (req as any).auth_context?.app_metadata?.user_id ??
    "admin"

  // Read-modify-write: a bare `{ metadata: { ... } }` REPLACES the whole jsonb.
  await orderModuleService.updateOrders(order.id, {
    metadata: {
      ...meta,
      ascolour_in_house_at: body.undo ? null : new Date().toISOString(),
      ascolour_in_house_by: body.undo ? null : actor,
      ascolour_in_house_note: body.undo ? null : body.note ?? null,
    },
  })

  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.ORDER,
    entity_id: order.id,
    action: AUDIT_ACTION.NOTE_ADDED,
    actor_id: actor,
    details: {
      source: "ascolour_dropship_queue",
      in_house: !body.undo,
      note: body.note ?? null,
    },
  })

  return res.json({ ok: true, in_house: !body.undo })
}
