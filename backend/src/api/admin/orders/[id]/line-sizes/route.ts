import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { enterLineSizes, sizeOptionsForLine } from "../../../../../services/order-sizes/enter-sizes"

/**
 * GET  /admin/orders/:id/line-sizes?line_item_id=…  → { line, sizes: [{ variant_id, size, unit_price }] }
 * POST /admin/orders/:id/line-sizes  { line_item_id, sizes: [{ variant_id, quantity, unit_price }] }
 *
 * Sizes for a line quoted without them (services/order-sizes/enter-sizes.ts).
 */
const bodySchema = z.object({
  line_item_id: z.string().min(1),
  sizes: z
    .array(
      z.object({
        variant_id: z.string().min(1),
        quantity: z.coerce.number().int().min(0).max(100_000),
        unit_price: z.coerce.number().min(0).max(100_000),
      })
    )
    .min(1)
    .max(60),
})

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const lineItemId = typeof req.query.line_item_id === "string" ? req.query.line_item_id : ""
  if (!lineItemId) return res.status(400).json({ message: "line_item_id is required" })
  res.json(await sizeOptionsForLine(req.scope, req.params.id, lineItemId))
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid sizes" })
  const result = await enterLineSizes(req.scope, {
    orderId: req.params.id,
    lineItemId: parsed.data.line_item_id,
    sizes: parsed.data.sizes,
    actorId: (req as any).auth_context?.actor_id ?? null,
  })
  res.json(result)
}
