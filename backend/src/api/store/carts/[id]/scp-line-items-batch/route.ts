import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

import { SCP_BLANK_ALIGNED_QUANTITY_TIERS } from "../../../../../lib/scp-dtf-print-pricing"
import {
  resolveTierForCartCustomer,
  type RemoteJoinerGraphLike,
} from "../../../../../lib/scp-resolve-garment-unit-price"
import { getPostHog } from "../../../../../lib/posthog"
import { recomputeScpCartPricing } from "../../../../../lib/recompute-scp-cart-pricing"
import {
  classifyCartAddError,
  extractWorkflowErrorMessage,
} from "../../../../../lib/cart-workflow-error"
import { computeScpLineDescriptor } from "../../../../../lib/scp-line-descriptor"

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

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as RemoteJoinerGraphLike

  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "customer_id",
      "currency_code",
      "region_id",
      "sales_channel_id",
      "completed_at",
      "region.id",
      "region.currency_code",
    ],
  })

  const cart = carts?.[0] as Record<string, unknown> | undefined
  if (!cart || typeof cart !== "object") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart "${cartId}" was not found.`)
  }

  if (cart.completed_at) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cannot modify a completed cart.")
  }

  // Flat tier garment price (replaces the bulk ladder) for tier customers.
  const tier = await resolveTierForCartCustomer(
    query,
    typeof cart.customer_id === "string" ? cart.customer_id : null
  )

  // Resolve every line's pricing + merged metadata up front. If any item
  // throws here, the whole batch fails before we touch the cart so the
  // customer doesn't get a partial state. Items are independent — fan them
  // out in parallel (~2 DB queries each via resolveGarmentUnitAmountMajor)
  // so a 252-line batch's pricing phase finishes in ~100ms instead of a
  // multi-second serial chain.
  const cartForDescriptor = cart as {
    id?: string
    currency_code?: string | null
    region_id?: string | null
    sales_channel_id?: string | null
    region?: { currency_code?: string | null } | null
  }
  const descriptors = await Promise.all(
    items.map(async (item, index) => {
      try {
        const descriptor = await computeScpLineDescriptor({
          variantId: item.variant_id,
          quantity: item.quantity,
          metadata: item.metadata,
          printSizeIdRaw: item.scp_print.print_size_id,
          cart: cartForDescriptor,
          query,
          tier,
        })
        return {
          variantId: descriptor.variantId,
          quantity: descriptor.quantity,
          unitPriceMajor: descriptor.unitPriceMajor,
          metadata: descriptor.metadata,
          printSizeId: descriptor.printSizeId,
          tierIndex: descriptor.tierIndex,
          decoratedSidesCount: descriptor.decoratedSides.length,
        }
      } catch (error) {
        if (error instanceof MedusaError) {
          // Prefix with the failing index so the storefront knows which row
          // to highlight rather than guessing.
          throw new MedusaError(
            error.type,
            `Item ${index + 1}/${items.length} (variant ${item.variant_id}): ${error.message}`
          )
        }
        throw error
      }
    })
  )

  // Snapshot the cart's existing line count so we can verify the workflow
  // actually appended N rows. Same defensive check as scp-line-items.
  const beforeRows = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["items.id"],
  })
  const beforeCount = ((beforeRows.data?.[0] as { items?: unknown[] } | undefined)?.items ?? []).length

  // ONE workflow run for all N items. addToCartWorkflow already accepts an
  // items array — we use it to push the whole batch through Medusa's
  // internal validation + insertion path in a single transaction-bound run
  // instead of N separate runs.
  try {
    await addToCartWorkflow(req.scope).run({
      input: {
        cart_id: cartId,
        items: descriptors.map((d) => ({
          variant_id: d.variantId,
          quantity: d.quantity,
          unit_price: d.unitPriceMajor,
          metadata: d.metadata,
        })),
      },
    })
  } catch (workflowError) {
    // eslint-disable-next-line no-console
    console.error(
      `addToCartWorkflow (batch, ${descriptors.length} items) threw:`,
      workflowError
    )
    const rawMessage = extractWorkflowErrorMessage(workflowError)
    const { type, message } = classifyCartAddError(rawMessage)
    throw new MedusaError(type, message)
  }

  const afterRows = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["items.id", "items.variant_id"],
  })
  const afterItems = ((afterRows.data?.[0] as {
    items?: Array<{ id?: string; variant_id?: string }>
  } | undefined)?.items ?? [])
  const afterCount = afterItems.length

  const expectedInserts = descriptors.length
  const actualInserts = afterCount - beforeCount
  if (actualInserts < expectedInserts) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `addToCartWorkflow ran but only appended ${actualInserts} of ${expectedInserts} expected lines. Most likely cause: one or more variants have no calculated_price for this region/currency, or aren't on the cart's sales channel.`
    )
  }

  // ONE recompute pass after every line is inserted — instead of N. This is
  // the change that makes a 252-line bulk add finish in seconds instead of
  // minutes.
  let aggregationSummary: { aggregated_quantity: number; updates: number } | undefined
  try {
    const result = await recomputeScpCartPricing(cartId, req.scope)
    aggregationSummary = {
      aggregated_quantity: result.aggregated_quantity,
      updates: result.updates.length,
    }
  } catch (aggError) {
    // eslint-disable-next-line no-console
    console.error("recomputeScpCartPricing (post-batch) failed (non-fatal)", aggError)
  }

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
