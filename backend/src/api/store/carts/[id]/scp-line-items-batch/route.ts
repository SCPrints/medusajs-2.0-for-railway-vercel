import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import { SCP_BLANK_ALIGNED_QUANTITY_TIERS } from "../../../../../lib/scp-dtf-print-pricing"
import { getPostHog } from "../../../../../lib/posthog"
import { addScpLinesToCart } from "../../../../../lib/scp-add-lines"

const cartParamsSchema = z.object({
  id: z.string().min(1),
})

const scpPrintSchema = z.object({
  version: z.number().int().optional(),
  print_size_id: z
    .string()
    .min(1)
    .transform((v) => v.trim()),
})

const itemSchema = z.object({
  variant_id: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999),
  metadata: z.record(z.string(), z.unknown()).optional(),
  scp_print: scpPrintSchema,
})

// The bulk-order grid posts one line per (colour × size) cell. For a typical
// AS-Colour-style catalogue that's up to ~10 colours × ~9 sizes = ~90; we cap
// at 300 to leave headroom for future products with wider grids without
// inviting a denial-of-service surface.
const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(300),
})

/**
 * POST /store/carts/:id/scp-line-items-batch
 *
 * Adds N SCP-priced customizable lines in a single workflow run. Used by the
 * bulk-order grid when a customer adds 100+ cells at once. Replaces N
 * sequential /scp-line-items POSTs — each of which triggered a full
 * recomputeScpCartPricing pass over the entire cart. That made the 252-cell
 * add an O(N²) workload (90% CPU on the Fly machine for ~5 min). This route
 * is O(N): one addToCartWorkflow.run with all items, then one recompute at
 * the end.
 *
 * Body: { items: [{ variant_id, quantity, metadata, scp_print }, ...] }
 *
 * All-or-nothing: if any item fails pricing validation (bad print_size_id,
 * missing decorated sides, etc.) the whole batch is rejected so the customer
 * doesn't end up with a partial cart they have to clean up by hand.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    return await scpLineItemsBatchPostHandler(req, res)
  } catch (error) {
    if (error instanceof MedusaError) {
      throw error
    }
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === "string"
        ? error
        : "no detail"
    // eslint-disable-next-line no-console
    console.error("scp-line-items-batch handler failed", error)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `SCP batch cart-add failed: ${detail}`
    )
  }
}

async function scpLineItemsBatchPostHandler(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const parsedParams = cartParamsSchema.safeParse(req.params ?? {})
  if (!parsedParams.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid cart id: ${parsedParams.error.message}`
    )
  }

  const parsedBody = bodySchema.safeParse(req.body ?? {})
  if (!parsedBody.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid payload: ${parsedBody.error.issues.map((i) => i.message).join(", ")}`
    )
  }

  const cartId = parsedParams.data.id
  const items = parsedBody.data.items

  // Shared with the bundle wizard route — see lib/scp-add-lines.ts.
  const result = await addScpLinesToCart(
    req.scope,
    cartId,
    items.map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      metadata: item.metadata,
      print_size_id: item.scp_print.print_size_id,
    }))
  )
  const descriptors = result.descriptors
  const actualInserts = result.items_added
  const afterCount = result.items_after
  const aggregationSummary = result.aggregation

  const distinctId = (req as any).auth_context?.actor_id ?? `cart_${cartId}`
  getPostHog()?.capture({
    distinctId,
    event: "scp line items batch added",
    properties: {
      cart_id: cartId,
      batch_size: descriptors.length,
      total_quantity: descriptors.reduce((sum, d) => sum + d.quantity, 0),
      unit_price_range_major: {
        min: Math.min(...descriptors.map((d) => d.unitPriceMajor)),
        max: Math.max(...descriptors.map((d) => d.unitPriceMajor)),
      },
      print_size_id: descriptors[0]?.printSizeId,
      tier_index: descriptors[0]?.tierIndex,
      quantity_tier_label:
        SCP_BLANK_ALIGNED_QUANTITY_TIERS[descriptors[0]?.tierIndex ?? 0]?.label ?? null,
    },
  })

  return res.status(200).json({
    ok: true,
    cart_id: cartId,
    items_added: actualInserts,
    items_after: afterCount,
    aggregation: aggregationSummary ?? null,
  })
}
