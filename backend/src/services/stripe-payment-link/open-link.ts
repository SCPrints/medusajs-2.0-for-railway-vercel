import type { MedusaContainer } from "@medusajs/framework/types"

import { STRIPE_PAYMENT_LINK_MODULE } from "../../modules/stripe-payment-link"

/** The order's newest still-open Stripe payment link, or null (none, or module off). */
export async function openPaymentLinkUrl(container: MedusaContainer, orderId: string): Promise<string | null> {
  try {
    const links = container.resolve(STRIPE_PAYMENT_LINK_MODULE) as any
    const [open] = await links.listStripePaymentLinks({ order_id: orderId, status: "open" }, { order: { created_at: "DESC" }, take: 1 })
    return typeof open?.url === "string" && open.url ? open.url : null
  } catch {
    return null
  }
}
