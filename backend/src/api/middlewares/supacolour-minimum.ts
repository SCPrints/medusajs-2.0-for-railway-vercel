/**
 * Middleware on POST /store/payment-collections/:id/payment-sessions — refuses
 * to open a payment while a Supacolour design is below the supplier minimum.
 * The cart UI explains it first; this is what holds if that's bypassed. Any
 * cart change drops its sessions, so a cart can't shrink past the gate.
 *
 * Fail-open like the checkout invariant: a lookup error never stops a sale.
 * Collections with no cart (order balances, deposits) pass straight through.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import {
  SUPACOLOUR_MINIMUM_MESSAGE,
  supacolourDesignShortfalls,
} from "../../lib/scp-supacolour-pricing"

export async function supacolourMinimumMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: () => void
) {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
      graph: (q: Record<string, unknown>) => Promise<{ data?: any[] }>
    }
    const { data: links } = await query.graph({
      entity: "cart_payment_collection",
      fields: ["cart_id"],
      filters: { payment_collection_id: (req.params as Record<string, string>).id },
    })
    const cartId = links?.[0]?.cart_id
    if (cartId) {
      const { data: carts } = await query.graph({
        entity: "cart",
        fields: ["id", "items.id", "items.quantity", "items.metadata"],
        filters: { id: cartId },
      })
      if (supacolourDesignShortfalls(carts?.[0]?.items ?? []).length) {
        return res.status(409).json({
          code: "supacolour_minimum",
          type: "invalid_data",
          message: SUPACOLOUR_MINIMUM_MESSAGE,
        })
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[supacolour-minimum] check failed (fail-open):", error)
  }
  return next()
}
