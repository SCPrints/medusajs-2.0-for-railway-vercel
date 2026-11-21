import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { addRangeToCart } from "../../../../../../../../services/org-range/add-to-cart"
import { requireMembership, requireRole } from "../../../_helpers"
import { parseBody, rangeItemsSchema } from "../_schema"

const bodySchema = z.object({
  cart_id: z.string().min(1).max(80),
  items: rangeItemsSchema,
  roster: z.union([z.literal("all"), z.array(z.string().min(1).max(80)).max(1000), z.null()]).optional(),
  packing: z.string().max(20).nullable().optional(),
  personalisation_requested: z.boolean().optional(),
})

/**
 * POST /store/customers/me/organisations/:id/range/add-to-cart
 *   { cart_id, items: [{ design_id, variant_id, quantity }],
 *     roster?: "all" | [roster_member_id] | null, packing?: "bulk" | "by_size" | "by_unit" | "individual",
 *     personalisation_requested?: boolean }
 *   → { added_lines, fee_lines_added, fees_for_staff: [title] }
 *
 * The one-screen order form's "Add all to cart" (owner / purchaser). The
 * server builds every line from the STORED design — the browser only says
 * which design, which size and how many — and prices it like a Studio add
 * (addScpLinesToCart), with the setup-fee lines a Studio add creates. All or
 * nothing: a line that can't be priced rejects the lot (422) before the cart
 * is touched. Lines carry `metadata.organisation_id`; the cart gets
 * `organisation_id` and, when sent, the roster / packing / names request.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const membership = await requireMembership(req)
  requireRole(membership, ["owner", "purchaser"])
  const body = parseBody(bodySchema, req.body)
  const result = await addRangeToCart(req.scope, membership, body)
  if ("message" in result) return res.status(422).json({ type: "pricing_failed", message: result.message })
  res.json({ added_lines: result.added_lines, fee_lines_added: result.fee_lines_added, fees_for_staff: result.fees_for_staff })
}
