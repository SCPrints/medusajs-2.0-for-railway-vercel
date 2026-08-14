import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { convertQuoteToOrder } from "../../../../../services/quote/convert"

/**
 * POST /admin/quotes/:id/convert-to-order
 *   → { ok: true, order_id, display_id, lines_added, skipped_items, idempotent? }
 *
 * Staff-side conversion of a quote into a real (unpaid) order — no customer
 * checkout. The order-placed email attaches the tax invoice, which shows the
 * balance due + bank details; staff record the EFT via the order's
 * "Record payment received". Idempotent: re-POSTing returns the existing order.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const actor = (req as any).auth_context?.actor_id ?? null
  try {
    const result = await convertQuoteToOrder(req.scope, {
      quoteId: req.params.id,
      actorId: actor,
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
