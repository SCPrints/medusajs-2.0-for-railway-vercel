import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { deliveryAddressSchema } from "../../../../../lib/delivery-address"
import { convertQuoteToOrder } from "../../../../../services/quote/convert"

const schema = z.object({
  shipping_address: deliveryAddressSchema.optional(),
  pickup: z.boolean().optional(),
})

/**
 * POST /admin/quotes/:id/convert-to-order
 *   body: { shipping_address?, pickup? }
 *   → { ok: true, order_id, display_id, lines_added, skipped_items, idempotent? }
 *
 * Staff-side conversion of a quote into a real (unpaid) order — no customer
 * checkout. The address given here (or `pickup`) becomes the order's
 * shipping address and is kept on the quote; without either, the
 * customer's saved default is used, else the studio's geo for tax only.
 * The order-placed email attaches the tax invoice (balance due + bank
 * details). Idempotent: re-POSTing returns the existing order.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const actor = (req as any).auth_context?.actor_id ?? null
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid_body" })
  }
  try {
    const result = await convertQuoteToOrder(req.scope, {
      quoteId: req.params.id,
      actorId: actor,
      shippingAddress: parsed.data.shipping_address ?? null,
      pickup: parsed.data.pickup === true,
    })
    return res.json({ ok: true, ...result })
  } catch (err: any) {
    if (err instanceof MedusaError) {
      const status =
        err.type === MedusaError.Types.NOT_FOUND
          ? 404
          : err.type === MedusaError.Types.NOT_ALLOWED
            ? 409
            : 500
      return res.status(status).json({ error: err.message })
    }
    // retrieveQuote throws a plain error on missing rows in some versions
    if (String(err?.message ?? "").toLowerCase().includes("not found")) {
      return res.status(404).json({ error: "quote not found" })
    }
    return res.status(500).json({ error: err?.message ?? "conversion failed" })
  }
}
