/**
 * Add N server-priced lines to a cart in ONE addToCartWorkflow run, then ONE
 * cart-wide recompute. Shared by POST /store/carts/:id/scp-line-items-batch
 * (bulk-order grid) and POST /store/carts/:id/bundle-items (bundle wizard).
 *
 * Lines with a `printSizeId` go through computeScpLineDescriptor (garment +
 * decoration, validated). Lines with `printSizeId: null` are plain garments
 * — Medusa's calculated variant price; the recompute re-tiers them like any
 * other ladder line.
 *
 * All-or-nothing: if any decorated line fails pricing validation the whole
 * batch is rejected before the cart is touched.
 */
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"

import { recomputeScpCartPricing } from "./recompute-scp-cart-pricing"
import {
  resolveTierForCartCustomer,
  type RemoteJoinerGraphLike,
} from "./scp-resolve-garment-unit-price"
import { classifyCartAddError, extractWorkflowErrorMessage } from "./cart-workflow-error"
import { computeScpLineDescriptor, type ScpLineDescriptor } from "./scp-line-descriptor"

export type ScpAddLineInput = {
  variant_id: string
  quantity: number
  metadata?: Record<string, unknown>
  /** null = plain garment line (no decoration pricing). */
  print_size_id: string | null
}

export type ScpAddLinesResult = {
  items_added: number
  items_after: number
  descriptors: ScpLineDescriptor[]
  aggregation: { aggregated_quantity: number; updates: number } | null
}

export async function addScpLinesToCart(
  scope: { resolve: (key: string) => unknown },
  cartId: string,
  items: ScpAddLineInput[]
): Promise<ScpAddLinesResult> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY) as RemoteJoinerGraphLike

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

  const cartForDescriptor = cart as {
    id?: string
    currency_code?: string | null
    region_id?: string | null
    sales_channel_id?: string | null
    region?: { currency_code?: string | null } | null
  }

  // Price every decorated line up front, in parallel (~2 DB queries each), so
  // a failure rejects the batch before the cart is touched.
  const priced = await Promise.all(
    items.map(async (item, index) => {
      if (item.print_size_id === null) return null
      try {
        return await computeScpLineDescriptor({
          variantId: item.variant_id,
          quantity: item.quantity,
          metadata: item.metadata,
          printSizeIdRaw: item.print_size_id,
          cart: cartForDescriptor,
          query,
          tier,
        })
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

  const beforeRows = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["items.id"],
  })
  const beforeCount = ((beforeRows.data?.[0] as { items?: unknown[] } | undefined)?.items ?? []).length

  // ONE workflow run for all N items instead of N separate runs.
  try {
    await addToCartWorkflow(scope as never).run({
      input: {
        cart_id: cartId,
        items: items.map((item, i) => {
          const d = priced[i]
          return d
            ? {
                variant_id: d.variantId,
                quantity: d.quantity,
                unit_price: d.unitPriceMajor,
                metadata: d.metadata,
              }
            : { variant_id: item.variant_id, quantity: item.quantity, metadata: item.metadata }
        }),
      },
    })
  } catch (workflowError) {
    // eslint-disable-next-line no-console
    console.error(`addToCartWorkflow (batch, ${items.length} items) threw:`, workflowError)
    const rawMessage = extractWorkflowErrorMessage(workflowError)
    const { type, message } = classifyCartAddError(rawMessage)
    throw new MedusaError(type, message)
  }

  const afterRows = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: ["items.id"],
  })
  const afterCount = ((afterRows.data?.[0] as { items?: unknown[] } | undefined)?.items ?? []).length
  const actualInserts = afterCount - beforeCount
  if (actualInserts < items.length) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `addToCartWorkflow ran but only appended ${actualInserts} of ${items.length} expected lines. Most likely cause: one or more variants have no calculated_price for this region/currency, or aren't on the cart's sales channel.`
    )
  }

  // ONE recompute pass after every line is inserted — instead of N.
  let aggregation: ScpAddLinesResult["aggregation"] = null
  try {
    const result = await recomputeScpCartPricing(cartId, scope)
    aggregation = {
      aggregated_quantity: result.aggregated_quantity,
      updates: result.updates.length,
    }
  } catch (aggError) {
    // eslint-disable-next-line no-console
    console.error("recomputeScpCartPricing (post-batch) failed (non-fatal)", aggError)
  }

  return {
    items_added: actualInserts,
    items_after: afterCount,
    descriptors: priced.filter((d): d is ScpLineDescriptor => d !== null),
    aggregation,
  }
}
