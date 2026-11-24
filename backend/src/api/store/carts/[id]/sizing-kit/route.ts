import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { recomputeScpCartPricing } from "../../../../../lib/recompute-scp-cart-pricing"
import { SIZING_KIT_MAX_SIZES, colourFrontImage, sizingKitProblem } from "../../../../../lib/sizing-kit"

const bodySchema = z.object({
  variant_ids: z.array(z.string().min(1).max(100)).min(1).max(SIZING_KIT_MAX_SIZES * 2),
})

/**
 * POST /store/carts/:id/sizing-kit  { variant_ids }
 *   → { ok: true, added_lines }
 *
 * Adds one blank garment per chosen size (one product), each line marked
 * `metadata.sizing_kit = true`, at the normal price — the deposit staff refund
 * when the kit comes back (lib/sizing-kit.ts). Cart id is the capability, as
 * on the other scp cart routes; team-store carts are refused by middleware.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const cartId = String(req.params?.id ?? "")
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!cartId || !parsed.success) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose the sizes for your kit.")
  const wanted = [...new Set(parsed.data.variant_ids)]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({ entity: "cart", filters: { id: cartId }, fields: ["id", "completed_at"] })
  const cart = carts?.[0] as { id: string; completed_at?: unknown } | undefined
  if (!cart) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.")
  if (cart.completed_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "That cart has already been checked out.")

  const { data: variants } = await query.graph({
    entity: "variant",
    filters: { id: wanted },
    fields: ["id", "title", "product_id", "product.status", "product.handle", "product.images.url", "options.value", "options.option.title"],
  })
  const live = ((variants ?? []) as any[]).filter((v) => v.product?.status === "published")
  const problem = sizingKitProblem(live.map((v) => ({ id: v.id, product_id: v.product_id ?? null })), wanted)
  if (problem) throw new MedusaError(MedusaError.Types.INVALID_DATA, problem)

  await addToCartWorkflow(req.scope as never).run({
    input: {
      cart_id: cartId,
      items: live.map((v) => {
        const colour =
          (v.options ?? []).find((o: any) => /colou?r/i.test(o?.option?.title ?? ""))?.value ??
          String(v.title ?? "").split(" / ")[0]
        const thumbnail = colourFrontImage(((v.product?.images ?? []) as any[]).map((i) => i?.url).filter(Boolean), colour)
        return {
          variant_id: v.id,
          quantity: 1,
          ...(thumbnail ? { thumbnail } : {}),
          metadata: { sizing_kit: true, product_handle: v.product?.handle ?? null },
        }
      }),
    },
  })
  // Normal garment price for the cart (same as any blank line).
  await recomputeScpCartPricing(cartId, req.scope).catch(() => undefined)

  res.json({ ok: true, added_lines: live.length })
}
