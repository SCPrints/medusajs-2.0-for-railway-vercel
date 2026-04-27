import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { listShippingOptionsForCartWorkflow } from "@medusajs/medusa/core-flows"

import { computeCartWeight } from "../../../lib/cart-weight"
import {
  SHIPPING_FLAT_RATE_MAX_GRAMS,
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
  SHIPSTATION_WAREHOUSE_COUNTRY_CODE,
  SHIPSTATION_WAREHOUSE_POSTCODE,
} from "../../../lib/constants"

type ShippingOption = {
  id: string
  provider_id?: string | null
  [key: string]: unknown
}

const isManualOption = (option: ShippingOption) =>
  typeof option.provider_id === "string" && option.provider_id.startsWith("manual_")

const isShipStationOption = (option: ShippingOption) =>
  typeof option.provider_id === "string" && option.provider_id.startsWith("shipstation_")

/**
 * Hybrid shipping endpoint:
 *   GET /store/cart-shipping-options?cart_id=...
 *
 * Returns the same shipping_options shape as Medusa's core
 * `/store/shipping-options?cart_id=...`, but filtered by the cart's total
 * gram weight (incl. packaging overhead):
 *   - ≤ `SHIPPING_FLAT_RATE_MAX_GRAMS`: only manual_* options (flat tiers)
 *   - >  threshold: only shipstation_* options (calculated quotes)
 *
 * The storefront calls this instead of `sdk.store.fulfillment.listCartOptions`,
 * which would otherwise return both tiers indiscriminately.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cartId = String(
    (req.query as Record<string, unknown>).cart_id ?? ""
  ).trim()

  if (!cartId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "cart_id query parameter is required"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "metadata",
      "items.id",
      "items.quantity",
      "items.metadata",
      "items.product_id",
      "items.variant.id",
      "items.variant.weight",
      "items.variant.product.weight",
      "items.product.weight",
    ],
  })

  const cart = carts?.[0]
  if (!cart) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${cartId} not found`)
  }

  const weightSummary = computeCartWeight(cart, SHIPPING_PACKAGING_OVERHEAD_GRAMS)
  const tier: "flat" | "live" =
    weightSummary.totalWeightGrams <= SHIPPING_FLAT_RATE_MAX_GRAMS ? "flat" : "live"

  // Stamp the decision onto cart.metadata so it rides into the order and the
  // Admin can render a "Shipping decision" panel post-checkout. Idempotent —
  // overwriting on every storefront poll means the latest cart state wins.
  const shippingDecision = {
    tier,
    total_weight_grams: weightSummary.totalWeightGrams,
    items_weight_grams: weightSummary.itemsWeightGrams,
    packaging_overhead_grams: weightSummary.packagingOverheadGrams,
    threshold_grams: SHIPPING_FLAT_RATE_MAX_GRAMS,
    items_missing_weight: weightSummary.itemsMissingWeight,
    ship_from_postcode: SHIPSTATION_WAREHOUSE_POSTCODE || null,
    ship_from_country: SHIPSTATION_WAREHOUSE_COUNTRY_CODE || null,
    computed_at: new Date().toISOString(),
  }
  try {
    const cartModule = req.scope.resolve(Modules.CART) as {
      updateCarts?: (
        id: string,
        data: { metadata?: Record<string, unknown> }
      ) => Promise<unknown>
    }
    if (typeof cartModule.updateCarts === "function") {
      const existingMetadata =
        ((cart as { metadata?: Record<string, unknown> }).metadata as
          | Record<string, unknown>
          | undefined) || {}
      await cartModule.updateCarts(cartId, {
        metadata: {
          ...existingMetadata,
          shipping_decision: shippingDecision,
        },
      })
    }
  } catch (err) {
    // Stamping is best-effort: the response below is the source of truth for
    // the storefront, so a metadata write failure must not 500 checkout.
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(
      `cart-shipping-options: failed to stamp cart.metadata.shipping_decision on ${cartId}: ${
        (err as Error).message
      }`
    )
  }

  const { result: allOptions } = await listShippingOptionsForCartWorkflow(req.scope).run({
    input: { cart_id: cartId, is_return: false },
  })

  const options = (allOptions ?? []) as ShippingOption[]

  // If the threshold filter would leave us with no options at all, fall back to
  // the unfiltered list so checkout never dead-ends. This is also what happens
  // in dev environments where ShipStation isn't configured (`shipstation_*`
  // options simply don't exist) — the manual flat tiers stay available even
  // when the cart is technically over the threshold.
  let filtered: ShippingOption[]
  if (tier === "flat") {
    const manualOnly = options.filter(isManualOption)
    filtered = manualOnly.length ? manualOnly : options
  } else {
    const liveOnly = options.filter(isShipStationOption)
    filtered = liveOnly.length ? liveOnly : options
  }

  res.json({
    shipping_options: filtered,
    total_weight_grams: weightSummary.totalWeightGrams,
    items_weight_grams: weightSummary.itemsWeightGrams,
    packaging_overhead_grams: weightSummary.packagingOverheadGrams,
    threshold_grams: SHIPPING_FLAT_RATE_MAX_GRAMS,
    items_missing_weight: weightSummary.itemsMissingWeight,
    tier,
  })
}
