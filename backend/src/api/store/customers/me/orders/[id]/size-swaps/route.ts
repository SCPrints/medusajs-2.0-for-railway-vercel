import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { recordRequest, requireOwnOrder } from "../../../../../../../services/customer-portal/requests"

const bodySchema = z.object({
  line_item_id: z.string().min(1).max(80),
  from_size: z.string().trim().min(1).max(40),
  to_size: z.string().trim().min(1).max(40),
  quantity: z.number().int().min(1).max(10000),
  note: z.string().trim().max(1000).optional(),
})

/**
 * POST /store/customers/me/orders/:id/size-swaps { line_item_id, from_size, to_size, quantity, note? } → { request }
 * A REQUEST staff decide. Never changes the order, stock or money.
 * Unknown line or quantity above the line's: 400. Someone else's order: 404.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { customerId, order } = await requireOwnOrder(req)
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Pick the item, the size now, the size you want and how many.")
  const b = parsed.data
  const line = order.items.find((i) => i.id === b.line_item_id)
  if (!line) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That item isn't on this order.")
  if (b.quantity > line.quantity) throw new MedusaError(MedusaError.Types.INVALID_DATA, `You only ordered ${line.quantity} of that item.`)

  const title = line.title ?? line.product_title ?? line.id
  const text = `Size swap requested: ${b.quantity} x ${title}, ${b.from_size} to ${b.to_size}${b.note ? `\n\n${b.note}` : ""}`
  const request = await recordRequest(
    req,
    order,
    customerId,
    { kind: "size_swap", line_item_id: line.id, from_size: b.from_size, to_size: b.to_size, quantity: b.quantity, note: b.note || null },
    { text, kind: "size_swap_requested", excerpt: text.replace("Size swap requested: ", "") }
  )
  return res.status(201).json({ request })
}
