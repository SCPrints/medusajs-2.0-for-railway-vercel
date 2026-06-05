import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Resolve the parent order id from a fulfillment id.
 *
 * Medusa core's `createOrderShipmentWorkflow` emits the
 * `shipment.created` event (`FulfillmentWorkflowEvents.SHIPMENT_CREATED`)
 * with `data: { id: <fulfillment_id>, no_notification }` — the `id` is the
 * **fulfillment** id, NOT the order id. Subscribers that need the order
 * (ORDER_SHIPPED email, held-stock decrement) must translate it.
 *
 * Resolves by filtering the FULFILLMENT on its native primary key and
 * selecting the linked order via the order↔fulfillment module link's `order`
 * field alias. Returns null if no order owns the fulfillment.
 *
 * IMPORTANT — do NOT "filter `order` by `fulfillments.id`" (the reverse
 * direction). `fulfillments` is a cross-module LINK field alias, not a native
 * order column, and Medusa's query layer does not translate a filter on it
 * into a join restriction on the parent — it fails / returns an arbitrary row
 * under `take:1`. Filtering on a native field (`fulfillment.id`) and SELECTING
 * a linked relation (`order.id`) is the supported shape (core does the same in
 * markOrderFulfillmentAsDeliveredWorkflow).
 */
export async function resolveOrderIdFromFulfillment(
  container: any,
  fulfillmentId: string
): Promise<string | null> {
  if (!fulfillmentId) return null

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { data } = await query.graph({
      entity: "fulfillment",
      fields: ["order.id"],
      filters: { id: fulfillmentId },
      pagination: { take: 1 },
    })
    const orderId = (data as any[])?.[0]?.order?.id
    return typeof orderId === "string" ? orderId : null
  } catch (err) {
    // Don't silently swallow — a query failure must be distinguishable from a
    // genuine no-match so a broken shipped-email pipeline is visible in logs.
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger?.warn?.(
      `resolve-order-from-fulfillment: query failed for fulfillment ${fulfillmentId}: ${
        (err as Error)?.message ?? err
      }`
    )
    return null
  }
}

/**
 * Resolve an order id from a subscriber `data` payload that may carry either
 * `order_id` (defensive — if a custom caller ever emits it directly) or `id`
 * (the fulfillment id, per the core `shipment.created` contract).
 */
export async function resolveOrderIdFromShipmentEvent(
  container: any,
  data: { id?: string; order_id?: string } | undefined
): Promise<string | null> {
  if (!data) return null
  if (typeof data.order_id === "string" && data.order_id) {
    return data.order_id
  }
  if (typeof data.id === "string" && data.id) {
    return resolveOrderIdFromFulfillment(container, data.id)
  }
  return null
}
