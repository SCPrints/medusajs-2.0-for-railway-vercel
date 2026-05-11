import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SubscriberArgs, SubscriberConfig } from "@medusajs/medusa"
import { applyCartGarmentReprice, repriceCartGarmentLinesWorkflow } from "../workflows/reprice-cart-garment-lines"

/**
 * Fires whenever any cart is mutated (line added, qty changed, line deleted).
 * Computes new pooled-quantity prices for all garment lines and applies any
 * that have drifted from the current unit_price.
 *
 * The compute step is idempotent: if no prices changed it returns an empty
 * changes list and we skip the updateLineItemInCart calls, preventing a
 * cart.updated → subscriber → cart.updated loop from running forever.
 */
export default async function cartGarmentRepriceHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const cartId: string | undefined = (data as { id?: string })?.id
  if (!cartId) {
    logger.warn("cart-garment-reprice: received cart.updated with no id, skipping")
    return
  }

  let changes: Awaited<ReturnType<typeof repriceCartGarmentLinesWorkflow.run>>["result"]["changes"]
  try {
    const result = await repriceCartGarmentLinesWorkflow(container).run({
      input: { cart_id: cartId },
    })
    changes = result.result.changes
  } catch (err) {
    logger.error(
      `cart-garment-reprice: compute step failed for cart ${cartId}: ${(err as Error).message}`
    )
    return
  }

  if (!changes.length) {
    return
  }

  try {
    await applyCartGarmentReprice(container, cartId, changes)
    logger.debug(
      `cart-garment-reprice: repriced ${changes.length} garment line(s) on cart ${cartId}`
    )
  } catch (err) {
    logger.error(
      `cart-garment-reprice: apply step failed for cart ${cartId}: ${(err as Error).message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
}
