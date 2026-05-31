import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { mergeOrderMetadata } from "../lib/order-metadata"

/**
 * Defensive bridge between cart and order:
 * `/store/cart-shipping-options` stamps `cart.metadata.shipping_decision`. The
 * core `completeCartWorkflow` is expected to copy `cart.metadata` onto the
 * created order, but we cannot rely on that for every Medusa version. This
 * subscriber re-reads the source cart and copies the blob across when it's
 * missing on the order. No-op when the order already carries the decision.
 */
export default async function orderPlacedStampShippingDecisionHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: orderId },
    fields: ["id", "cart_id", "metadata"],
  })
  const order = orders?.[0]
  if (!order) {
    return
  }

  const orderMetadata =
    ((order as { metadata?: Record<string, unknown> }).metadata as
      | Record<string, unknown>
      | undefined) || {}
  if (orderMetadata.shipping_decision) {
    return
  }

  const cartId = (order as { cart_id?: string | null }).cart_id
  if (!cartId) {
    return
  }

  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["id", "metadata"],
  })
  const cart = carts?.[0] as { metadata?: Record<string, unknown> } | undefined
  const cartMetadata = cart?.metadata as Record<string, unknown> | undefined
  const decision = cartMetadata?.shipping_decision
  if (!decision) {
    return
  }

  try {
    // Atomic JSONB merge — concurrent order.placed stamps would otherwise
    // clobber each other (Medusa update REPLACES the metadata jsonb).
    await mergeOrderMetadata(container, orderId, {
      shipping_decision: decision,
    })
  } catch (err) {
    logger.error(
      `order.placed shipping_decision bridge: failed to mirror cart.metadata.shipping_decision onto order ${orderId}: ${
        (err as Error).message
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
