import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { mergeOrderMetadata } from "../lib/order-metadata"
import { resolveOrderPoNumber } from "../lib/po-number"

/**
 * Copies the customer's purchase-order number from `cart.metadata.po_number`
 * onto `order.metadata.po_number`, trimmed and capped at 60 characters.
 * completeCartWorkflow already copies cart metadata, so this mostly cleans
 * the value; it also covers a Medusa version that stops copying it.
 */
export default async function orderPlacedStampPoNumberHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: orderId },
      fields: ["id", "metadata"],
    })
    const current = (orders?.[0] as { metadata?: Record<string, unknown> } | undefined)?.metadata
    const po = await resolveOrderPoNumber(container, orderId, current)
    if (!po) {
      // A blank / junk value copied from the cart: drop it.
      if (current && "po_number" in current) {
        await mergeOrderMetadata(container, orderId, {}, { unset: ["po_number"] })
      }
      return
    }
    if (current?.po_number === po) return
    await mergeOrderMetadata(container, orderId, { po_number: po })
  } catch (err) {
    logger.error(`order.placed po_number stamp failed for ${orderId}: ${(err as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
