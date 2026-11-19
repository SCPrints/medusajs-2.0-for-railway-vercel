import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"

import { ORGANISATION_MODULE } from "../modules/organisation"

/**
 * A draft / approved organisation cart that has now been ordered: mark its
 * `organisation_cart` row "ordered" so it leaves the Drafts & approvals list.
 * (The order's organisation / on-account metadata is written onto the cart
 * by the checkout guard before completion, so nothing is stamped here.)
 */
export default async function orderPlacedMarkOrganisationCart({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data?.id
  if (!orderId) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
    const { data: links } = await query.graph({
      entity: "order_cart",
      filters: { order_id: orderId },
      fields: ["cart_id"],
    })
    const cartId = (links as any[])?.[0]?.cart_id
    if (!cartId) return
    const service = container.resolve(ORGANISATION_MODULE) as any
    const [row] = (await service.listOrganisationCarts({ cart_id: cartId }, { take: 1 })) as any[]
    if (!row || row.status === "ordered") return
    await service.updateOrganisationCarts([{ id: row.id, status: "ordered", order_id: orderId }])
  } catch (err) {
    logger.error(`order.placed organisation-cart mark failed for ${orderId}: ${(err as Error).message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
