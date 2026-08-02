import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows"

import { computeCartWeight } from "../../../lib/cart-weight"
import {
  SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS,
  SHIPPING_FLAT_RATE_MAX_GRAMS,
  SHIPPING_PACKAGING_OVERHEAD_GRAMS,
} from "../../../lib/constants"
import { computeShippingAmount } from "../../../lib/shipping-rate"

type ShippingOption = {
  id: string
  provider_id?: string | null
  [key: string]: unknown
}

const isScpOption = (option: ShippingOption) =>
  typeof option.provider_id === "string" && option.provider_id.startsWith("scp_")

/**
 * Shipping options endpoint:
 *   GET /store/cart-shipping-options?cart_id=...
 *
 * Returns the same shipping_options shape as Medusa's core
 * `/store/shipping-options?cart_id=...`, but narrowed to SC Prints' single
 * weight-based "Standard Shipping (AU)" option (provider `scp_scp`). The price
 * is computed by that provider from the cart's total weight — see
 * lib/shipping-rate.ts. Express + the old flat/live-carrier options were
 * retired (see scripts/reconfigure-shipping-weight-based.ts).
 *
 * Total weight uses the default-garment-weight fallback so it scales with order
 * size even though almost nothing in the catalog has a weight set yet.
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

  const weightSummary = computeCartWeight(
    cart,
    SHIPPING_PACKAGING_OVERHEAD_GRAMS,
    SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS
  )

  // Stamp the decision onto cart.metadata so it rides into the order and the
  // Admin "Shipping decision" panel can render the weight breakdown post-
  // checkout. Idempotent — the latest storefront poll wins. `tier` stays
  // "flat" so the existing admin widget keeps rendering; `model` records the
  // real mechanism. `amount_aud` is the quoted rate (inc-GST) the provider
  // would compute for this weight.
  const shippingDecision = {
    tier: "flat" as const,
    model: "weight_based" as const,
    provider: "scp",
    total_weight_grams: weightSummary.totalWeightGrams,
    items_weight_grams: weightSummary.itemsWeightGrams,
    packaging_overhead_grams: weightSummary.packagingOverheadGrams,
    default_item_weight_grams: weightSummary.defaultItemWeightGrams,
    threshold_grams: SHIPPING_FLAT_RATE_MAX_GRAMS,
    items_missing_weight: weightSummary.itemsMissingWeight,
    amount_aud: computeShippingAmount(weightSummary.totalWeightGrams),
    ship_from_postcode: null,
    ship_from_country: null,
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

  // MUST use the *WithPricing* workflow. The "Standard Shipping (AU)" option is
  // `price_type: "calculated"`, so its price only exists once the provider's
  // calculatePrice runs (calculateShippingOptionsPricesStep). The plain
  // `listShippingOptionsForCartWorkflow` deliberately skips that step — it
  // returns calculated options with a null `calculated_price`, which the
  // storefront renders as "Unavailable" and blocks checkout. (It worked for the
  // old flat-rate options because their price is a stored price-set value.)
  const { result: allOptions } =
    await listShippingOptionsForCartWithPricingWorkflow(req.scope).run({
      input: { cart_id: cartId, is_return: false },
    })

  const options = (allOptions ?? []) as ShippingOption[]

  // Narrow to the SC Prints weight-based option. Fall back to the unfiltered
  // list so checkout never dead-ends if the option hasn't been created yet
  // (e.g. before scripts/reconfigure-shipping-weight-based.ts has run).
  const scpOnly = options.filter(isScpOption)
  const filtered = scpOnly.length ? scpOnly : options

  res.json({
    shipping_options: filtered,
    total_weight_grams: weightSummary.totalWeightGrams,
    items_weight_grams: weightSummary.itemsWeightGrams,
    packaging_overhead_grams: weightSummary.packagingOverheadGrams,
    default_item_weight_grams: weightSummary.defaultItemWeightGrams,
    threshold_grams: SHIPPING_FLAT_RATE_MAX_GRAMS,
    items_missing_weight: weightSummary.itemsMissingWeight,
    tier: "flat",
    provider: "scp",
  })
}
