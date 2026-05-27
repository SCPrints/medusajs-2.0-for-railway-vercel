import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { IOrderModuleService } from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import { writeAudit } from "../lib/audit-log"
import { ORG_INVENTORY_MODULE } from "../modules/org-inventory"
import type OrgInventoryModuleService from "../modules/org-inventory/service"

/**
 * Phase 1 of the customer fulfillment service.
 *
 * When a fulfillment order is cancelled, release the reservation on
 * every held_stock line (decrements quantity_reserved only, leaving
 * quantity_on_hand untouched). Print-on-demand lines have no
 * reservation to release; their print tasks are not auto-cancelled
 * (staff intervention via /app/tasks).
 *
 * Only runs if the placed-subscriber actually reserved (gates on
 * `metadata.fulfillment_subscriber_ran` — without it we'd try to
 * release reservations that were never made).
 *
 * Idempotent: stamps `fulfillment_cancel_released` on first run.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → Workflow C.
 */
export default async function fulfillmentOnOrderCancelled({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const orderModuleService: IOrderModuleService = container.resolve(
    Modules.ORDER
  )

  let order: any
  try {
    order = await orderModuleService.retrieveOrder(orderId, {
      relations: ["items"],
    })
  } catch (err) {
    logger.error(
      `[fulfillment-on-order-cancelled] retrieve order ${orderId} failed: ${(err as Error).message}`
    )
    return
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  if (!meta.fulfillment_order) return
  if (!meta.fulfillment_subscriber_ran) return // never reserved
  if (meta.fulfillment_shipment_decremented) return // already shipped
  if (meta.fulfillment_cancel_released) return // idempotency

  const invService = container.resolve<OrgInventoryModuleService>(
    ORG_INVENTORY_MODULE
  )

  const items = (order.items ?? []) as any[]
  for (const line of items) {
    const lineMeta = (line.metadata ?? {}) as Record<string, any>
    if (!lineMeta.fulfillment_line) continue
    if (lineMeta.fulfillment_mode !== "held_stock") continue
    const invId = lineMeta.org_inventory_id as string | undefined
    const quantity: number = Number(line.quantity ?? 0)
    if (!invId || quantity <= 0) continue

    try {
      await invService.release({
        org_inventory_id: invId,
        quantity,
        order_id: orderId,
      })
      await writeAudit({
        container: container as any,
        entity: AUDIT_ENTITY.ORG_INVENTORY,
        entity_id: invId,
        action: AUDIT_ACTION.STOCK_RELEASED,
        details: { quantity, order_id: orderId, line_item_id: line.id },
      })
    } catch (err) {
      logger.error(
        `[fulfillment-on-order-cancelled] line ${line.id} on order ${orderId}: ${(err as Error).message}`
      )
    }
  }

  try {
    await orderModuleService.updateOrders(orderId, {
      metadata: { ...meta, fulfillment_cancel_released: true },
    })
  } catch (err) {
    logger.error(
      `[fulfillment-on-order-cancelled] could not stamp processed flag on ${orderId}: ${(err as Error).message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.cancelled",
}
