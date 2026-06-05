import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { IOrderModuleService } from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import { writeAudit } from "../lib/audit-log"
import { captureEvent } from "../lib/posthog"
import { revalidateOrgTags } from "../lib/storefront-revalidate"
import { resolveOrderIdFromShipmentEvent } from "../lib/resolve-order-from-fulfillment"
import { ORG_INVENTORY_MODULE } from "../modules/org-inventory"
import type OrgInventoryModuleService from "../modules/org-inventory/service"

/**
 * Phase 1 of the customer fulfillment service.
 *
 * When a shipment is created on a fulfillment order, decrement
 * quantity_on_hand AND quantity_reserved for every held_stock line.
 * print_on_demand lines have no inventory to decrement.
 *
 * Idempotent: stamps `fulfillment_shipment_decremented` on the order
 * after first run so re-fired events don't double-decrement.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → Workflow B.
 */
export default async function fulfillmentOnShipmentCreated({
  event: { data },
  container,
}: SubscriberArgs<{ id?: string; order_id?: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  // `shipment.created` carries the fulfillment id; translate to the order.
  const orderId = await resolveOrderIdFromShipmentEvent(container, data)
  if (!orderId) return

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
      `[fulfillment-on-shipment-created] retrieve order ${orderId} failed: ${(err as Error).message}`
    )
    return
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  if (!meta.fulfillment_order) return
  if (meta.fulfillment_shipment_decremented) return

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
      await invService.ship({
        org_inventory_id: invId,
        quantity,
        order_id: orderId,
      })
      await writeAudit({
        container: container as any,
        entity: AUDIT_ENTITY.ORG_INVENTORY,
        entity_id: invId,
        action: AUDIT_ACTION.STOCK_SHIPPED,
        details: { quantity, order_id: orderId, line_item_id: line.id },
      })
      captureEvent("system", "org_stock_shipped", {
        org_inventory_id: invId,
        organisation_id: meta.organisation_id,
        quantity,
        order_id: orderId,
      })
    } catch (err) {
      logger.error(
        `[fulfillment-on-shipment-created] line ${line.id} on order ${orderId}: ${(err as Error).message}`
      )
    }
  }

  try {
    await orderModuleService.updateOrders(orderId, {
      metadata: { ...meta, fulfillment_shipment_decremented: true },
    })
  } catch (err) {
    logger.error(
      `[fulfillment-on-shipment-created] could not stamp processed flag on ${orderId}: ${(err as Error).message}`
    )
  }

  if (meta.organisation_id) {
    void revalidateOrgTags(String(meta.organisation_id), [
      "orders",
      "inventory",
    ])
  }
}

export const config: SubscriberConfig = {
  event: "shipment.created",
}
