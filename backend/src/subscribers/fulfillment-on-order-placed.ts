import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { IOrderModuleService } from "@medusajs/framework/types"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../lib/audit-entities"
import { writeAudit } from "../lib/audit-log"
import { captureEvent } from "../lib/posthog"
import { mergeOrderMetadata } from "../lib/order-metadata"
import { revalidateOrgTags } from "../lib/storefront-revalidate"
import { ORG_INVENTORY_MODULE } from "../modules/org-inventory"
import type OrgInventoryModuleService from "../modules/org-inventory/service"
import { TASK_MODULE } from "../modules/task"
import type TaskModuleService from "../modules/task/service"

/**
 * Phase 1 of the customer fulfillment service.
 *
 * On every order.placed event, if the order is tagged
 * `metadata.fulfillment_order = true`:
 *
 *  - For each held_stock line: reserve the quantity on the org_inventory
 *    row. Over-allocation is allowed; an unassigned print task is
 *    auto-created for the deficit so production knows to print more.
 *  - For each print_on_demand line: create an unassigned print task
 *    referencing the design's print_file_url.
 *
 * Gates on `metadata.fulfillment_order` so non-fulfillment orders skip
 * cleanly.
 *
 * Idempotent: writes a metadata flag on the order after first run so a
 * re-fired event doesn't double-reserve / double-create-tasks.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → Workflow A.
 */
export default async function fulfillmentOnOrderPlaced({
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
      `[fulfillment-on-order-placed] retrieve order ${orderId} failed: ${(err as Error).message}`
    )
    return
  }

  const meta = (order.metadata ?? {}) as Record<string, unknown>
  if (!meta.fulfillment_order) return
  if (meta.fulfillment_subscriber_ran) return // idempotency

  const invService = container.resolve<OrgInventoryModuleService>(
    ORG_INVENTORY_MODULE
  )
  const taskService = container.resolve<TaskModuleService>(TASK_MODULE)

  const items = (order.items ?? []) as any[]
  const fulfillmentLines = items.filter(
    (it) => (it.metadata ?? {}).fulfillment_line === true
  )

  for (const line of fulfillmentLines) {
    const lineMeta = (line.metadata ?? {}) as Record<string, any>
    const invId = lineMeta.org_inventory_id as string | undefined
    const designId = lineMeta.organisation_design_id as string | undefined
    const mode = lineMeta.fulfillment_mode as string | undefined
    const printFileUrl = (lineMeta.print_file_url as string | null) ?? null
    const quantity: number = Number(line.quantity ?? 0)

    if (!invId || quantity <= 0) continue

    try {
      if (mode === "held_stock") {
        const row = await invService.retrieveOrgInventory(invId)
        const available =
          (row.quantity_on_hand ?? 0) - (row.quantity_reserved ?? 0)

        await invService.reserve({
          org_inventory_id: invId,
          quantity,
          order_id: orderId,
        })

        await writeAudit({
          container: container as any,
          entity: AUDIT_ENTITY.ORG_INVENTORY,
          entity_id: invId,
          action: AUDIT_ACTION.STOCK_RESERVED,
          details: { quantity, order_id: orderId, line_item_id: line.id },
        })
        captureEvent("system", "org_stock_reserved", {
          org_inventory_id: invId,
          organisation_id: meta.organisation_id,
          quantity,
          order_id: orderId,
        })

        // Over-allocation → auto-create print task for the deficit
        if (quantity > available) {
          const deficit = quantity - available
          await taskService.createTasks([
            {
              kind: "print_run",
              title: `Print run (deficit): ${line.title}`,
              body: `Reservation exceeded availability by ${deficit} units. Print run needed to back the over-allocation.`,
              priority: "high",
              status: "open",
              assignee_user_id: null,
              order_id: orderId,
              organisation_id: meta.organisation_id ?? null,
              customer_id: order.customer_id ?? null,
              metadata: {
                fulfillment_print_task: true,
                org_inventory_id: invId,
                organisation_design_id: designId,
                deficit_quantity: deficit,
                print_file_url: printFileUrl,
                source_order_id: orderId,
                source_line_item_id: line.id,
              },
            } as any,
          ])
        }
      } else if (mode === "print_on_demand") {
        await taskService.createTasks([
          {
            kind: "print_run",
            title: `Print run: ${line.title} × ${quantity}`,
            body: `Print-on-demand line from fulfillment order #${order.display_id ?? orderId}.`,
            priority: "normal",
            status: "open",
            assignee_user_id: null,
            order_id: orderId,
            organisation_id: meta.organisation_id ?? null,
            customer_id: order.customer_id ?? null,
            metadata: {
              fulfillment_print_task: true,
              org_inventory_id: invId,
              organisation_design_id: designId,
              quantity,
              print_file_url: printFileUrl,
              source_order_id: orderId,
              source_line_item_id: line.id,
            },
          } as any,
        ])
        captureEvent("system", "print_on_demand_task_created", {
          org_inventory_id: invId,
          organisation_id: meta.organisation_id,
          quantity,
          order_id: orderId,
        })
      }
    } catch (err) {
      logger.error(
        `[fulfillment-on-order-placed] line ${line.id} on order ${orderId}: ${(err as Error).message}`
      )
    }
  }

  // Mark processed for idempotency. Atomic JSONB merge — this runs
  // concurrently with the other order.placed metadata stampers, so a
  // read-modify-write would clobber their keys (and vice-versa).
  try {
    await mergeOrderMetadata(container, orderId, {
      fulfillment_subscriber_ran: true,
    })
  } catch (err) {
    logger.error(
      `[fulfillment-on-order-placed] could not stamp processed flag on ${orderId}: ${(err as Error).message}`
    )
  }

  // Bust the storefront's per-org orders + inventory caches (Phase 2)
  if (meta.organisation_id) {
    void revalidateOrgTags(String(meta.organisation_id), [
      "orders",
      "inventory",
    ])
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
