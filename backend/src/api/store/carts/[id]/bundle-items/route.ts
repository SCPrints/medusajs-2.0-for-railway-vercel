import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { buildBundleCartLines } from "../../../../../lib/bundle-lines"
import { addScpLinesToCart } from "../../../../../lib/scp-add-lines"
import { getPostHog } from "../../../../../lib/posthog"

const paramsSchema = z.object({ id: z.string().min(1) })

const bodySchema = z.object({
  bundle_handle: z.string().trim().min(1).max(200),
  artwork_url: z
    .string()
    .trim()
    .url()
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "artwork_url must be http(s)")
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z
    .array(
      z.object({
        bundle_item_id: z.string().min(1),
        product_handle: z.string().trim().min(1),
        lines: z
          .array(
            z.object({
              variant_id: z.string().min(1),
              quantity: z.coerce.number().int().min(1).max(999),
            })
          )
          .min(1)
          .max(60),
      })
    )
    .min(1)
    .max(20),
})

/**
 * POST /store/carts/:id/bundle-items
 *
 * Adds a configured bundle to the cart as server-priced lines: garment +
 * decoration from the bundle item's print positions (lib/bundle-lines.ts),
 * through the same descriptor + recompute the Studio uses. The client sends
 * only WHICH item, WHICH garment choice and WHICH variants/quantities — every
 * pricing input is read from the bundle row, and each garment must be one of
 * the item's allowed choices.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id: cartId } = paramsSchema.parse(req.params ?? {})
  const parsed = bodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid payload: ${parsed.error.issues.map((i) => i.message).join(", ")}`
    )
  }
  const body = parsed.data

  const artworkUrl = body.artwork_url ?? null
  const { bundle, lines } = await buildBundleCartLines(req.scope, {
    bundle: { handle: body.bundle_handle },
    artworkUrl,
    notes: body.notes || null,
    items: body.items,
  })

  const result = await addScpLinesToCart(req.scope, cartId, lines)

  getPostHog()?.capture({
    distinctId: (req as any).auth_context?.actor_id ?? `cart_${cartId}`,
    event: "bundle added to cart",
    properties: {
      cart_id: cartId,
      bundle_handle: bundle.handle,
      line_count: lines.length,
      total_quantity: lines.reduce((sum, l) => sum + l.quantity, 0),
      has_artwork: Boolean(artworkUrl),
      discount_pct: bundle.discount_pct,
    },
  })

  return res.status(200).json({
    ok: true,
    cart_id: cartId,
    items_added: result.items_added,
    items_after: result.items_after,
  })
}
