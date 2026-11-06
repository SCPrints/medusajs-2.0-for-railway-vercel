import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { addQuoteLinesToOrder, quoteLinesNotOnOrder } from "../../../../../services/quote/add-lines-to-order"

/**
 * GET  /admin/quotes/:id/order-lines  → { order_id, display_id, lines: [{ id, title, quantity, unit_price }] }
 * POST /admin/quotes/:id/order-lines  { line_ids } → { order_id, added }
 *
 * Quote lines added after the quote converted, and putting them on the order
 * (services/quote/add-lines-to-order.ts).
 */
const bodySchema = z.object({ line_ids: z.array(z.string().min(1)).min(1).max(100) })

const fail = (res: MedusaResponse, err: any) => {
  const status = err instanceof MedusaError && err.type === MedusaError.Types.NOT_ALLOWED ? 409 : 500
  return res.status(status).json({ error: err?.message ?? "failed" })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    res.json(await quoteLinesNotOnOrder(req.scope, req.params.id))
  } catch (err) {
    fail(res, err)
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "line_ids is required" })
  try {
    res.json(
      await addQuoteLinesToOrder(req.scope, {
        quoteId: req.params.id,
        lineIds: parsed.data.line_ids,
        actorId: (req as any).auth_context?.actor_id ?? null,
      })
    )
  } catch (err) {
    fail(res, err)
  }
}
