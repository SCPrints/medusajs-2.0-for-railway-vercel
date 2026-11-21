import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import type { ICartModuleService } from "@medusajs/framework/types"
import { refreshCartItemsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { recomputeScpCartPricing } from "../../../../../lib/recompute-scp-cart-pricing"
import { sampleBlockReason } from "../../../../../lib/sample-line"

const bodySchema = z.object({ line_id: z.string().min(1).max(100) })

/**
 * POST /store/carts/:id/sample-line  { line_id }
 *
 * "Order one sample first": the line becomes ONE garment (this size) with
 * metadata.sample = true; its other sizes (same design group) are removed.
 * Price comes from the normal recompute at quantity 1 — nothing is discounted
 * or credited. 404 when the line is not on this cart; 400 when the method's
 * minimum rules out a single garment. Cart id is the capability, as on the
 * other scp cart routes.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const cartId = String(req.params?.id ?? "")
  const body = bodySchema.safeParse(req.body ?? {})
  if (!cartId || !body.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "A cart and line_id are required")
  }
  const cartModule = req.scope.resolve(Modules.CART) as ICartModuleService
  const lines = (await cartModule.listLineItems(
    { cart_id: cartId },
    { select: ["id", "title", "product_title", "quantity", "metadata"] as any }
  )) as any[]
  const line = lines.find((l) => l.id === body.data.line_id)
  if (!line) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Line not found")

  const reason = sampleBlockReason(line.metadata, line.product_title || line.title)
  if (reason) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, reason)

  const groupId = line.metadata?.customizerDesign?.group_id
  const siblings = groupId
    ? lines.filter((l) => l.id !== line.id && l.metadata?.customizerDesign?.group_id === groupId).map((l) => l.id)
    : []

  await cartModule.updateLineItems([{ id: line.id, quantity: 1, metadata: { ...line.metadata, sample: true } } as any])
  if (siblings.length) await cartModule.deleteLineItems(siblings)
  await refreshCartItemsWorkflow(req.scope as never).run({ input: { cart_id: cartId } })
  // Re-prices at quantity 1 (and re-tiers whatever else is in the cart).
  await recomputeScpCartPricing(cartId, req.scope, { lineIds: [line.id], perLine: true }).catch(() => undefined)

  return res.status(200).json({ ok: true, line_id: line.id, removed_line_ids: siblings })
}
