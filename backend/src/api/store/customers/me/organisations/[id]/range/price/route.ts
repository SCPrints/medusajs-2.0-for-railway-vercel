import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { buildRangeOrderLines, loadOwnCart, priceRangeLines } from "../../../../../../../../services/org-range"
import { requireMembership } from "../../../_helpers"
import { parseBody, rangeItemsSchema } from "../_schema"

const bodySchema = z.object({ cart_id: z.string().min(1).max(80), items: rangeItemsSchema })

/**
 * POST /store/customers/me/organisations/:id/range/price
 *   { cart_id, items: [{ design_id, variant_id, quantity }] }
 *   → { currency_code, lines: [{ design_id, variant_id, quantity, unit_price, total }],
 *       setup_fees: [{ title, quantity, unit_price, total }], total_quantity, total }
 *
 * The order form's running price: this customer's price (their tier, quantity
 * breaks over the whole cart, decoration from the stored design), GST
 * included. Reads only — nothing is added. 422 `pricing_failed` when a line
 * can't be priced.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  const body = parseBody(bodySchema, req.body)
  const cart = await loadOwnCart(req.scope, body.cart_id, membership.customer_id, true)
  const lines = await buildRangeOrderLines(req.scope, membership.organisation_id, body.items)
  try {
    res.json(await priceRangeLines(req.scope, cart, lines))
  } catch (error) {
    if (!(error instanceof MedusaError)) throw error
    res.status(422).json({ type: "pricing_failed", message: error.message })
  }
}
