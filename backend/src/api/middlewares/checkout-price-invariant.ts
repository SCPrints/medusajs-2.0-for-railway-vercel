/**
 * Middleware on POST /store/carts/:id/complete — the single chokepoint every
 * customer checkout funnels through. Runs the pricing invariant
 * (lib/checkout-price-invariant.ts) as the last gate before the cart becomes
 * an order.
 *
 * In the default "alert" mode this only observes (log + PostHog); in "block"
 * mode a block-severity finding stops the checkout with a customer-safe 409.
 * Fail-open: any error inside the invariant lets the checkout proceed.
 *
 * Bypass paths (documented, watched by the daily order audit instead):
 * POS checkout (staff-observed draft-order flow) and admin-created orders.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  invariantMode,
  runCheckoutPriceInvariant,
} from "../../lib/checkout-price-invariant"

const CUSTOMER_MESSAGE =
  "We couldn't verify the pricing on your order, so we've paused it rather than charge you incorrectly. " +
  "Nothing has been charged. Please try again in a few minutes — or contact us and we'll sort it out straight away."

export async function checkoutPriceInvariantMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: () => void
) {
  const cartId = (req.params as Record<string, string> | undefined)?.id
  const result = await runCheckoutPriceInvariant(cartId ?? "", req.scope)
  if (result?.verdict === "block" && invariantMode() === "block") {
    return res.status(409).json({
      code: "pricing_verification_failed",
      type: "invalid_data",
      message: CUSTOMER_MESSAGE,
    })
  }
  return next()
}
