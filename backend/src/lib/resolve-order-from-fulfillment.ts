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
 * Uses the order↔fulfillment module link via query.graph relation filter
 * (the same `order.fulfillments` relation core itself queries in the
 * create-shipment workflow). Returns null if no order owns the fulfillment.
 */
export async function resolveOrderIdFromFulfillment(
  container: any,
  fulfillmentId: string
): Promise<string | null> {
  if (!fulfillmentId) return null

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id"],
      filters: { fulfillments: { id: fulfillmentId } } as any,
      pagination: { take: 1 },
    })
    const orderId = (orders as any[])?.[0]?.id
    return typeof orderId === "string" ? orderId : null
  } catch {
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
