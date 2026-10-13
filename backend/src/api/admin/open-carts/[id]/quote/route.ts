import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { createQuoteFromCart } from "../../../../../lib/open-carts"

/**
 * POST /admin/open-carts/:id/quote → { quote_id, public_id, created }
 * Staff "Convert to quote". Idempotent — returns the existing quote if the cart
 * was already converted (by staff or by the customer's "Email me a quote").
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const actor = (req as any).auth_context?.actor_id ?? "admin"
  try {
    const result = await createQuoteFromCart(req.scope, req.params.id, { source: "admin", actor })
    res.status(result.created ? 201 : 200).json(result)
  } catch (err: any) {
    res.status(err?.status ?? 500).json({ message: err?.message ?? "Failed to create quote" })
  }
}
