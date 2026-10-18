import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cache } from "react"

export type CartShippingTier = "flat" | "live"

export type CartShippingOptionsResponse = {
  shipping_options: HttpTypes.StoreCartShippingOption[]
  total_weight_grams: number
  items_weight_grams: number
  packaging_overhead_grams: number
  threshold_grams: number
  items_missing_weight: number
  tier: CartShippingTier
}

const EMPTY_RESPONSE: CartShippingOptionsResponse = {
  shipping_options: [],
  total_weight_grams: 0,
  items_weight_grams: 0,
  packaging_overhead_grams: 0,
  threshold_grams: 0,
  items_missing_weight: 0,
  tier: "flat",
}

/**
 * Fetches the cart's eligible shipping options via the custom hybrid route
 * `/store/cart-shipping-options`. The route returns the single weight-based
 * "Standard Shipping (AU)" option, priced from the cart's total gram weight.
 *
 * Returns the full payload so callers can also surface `tier` and weight info.
 */
export const listCartShippingOptions = cache(async function (
  cartId: string
): Promise<CartShippingOptionsResponse> {
  if (!cartId) {
    return EMPTY_RESPONSE
  }

  return sdk.client
    .fetch<CartShippingOptionsResponse>(`/store/cart-shipping-options`, {
      method: "GET",
      query: { cart_id: cartId },
      next: { tags: ["shipping"] },
    })
    .catch(() => EMPTY_RESPONSE)
})

/**
 * @deprecated Prefer `listCartShippingOptions` so callers also receive the
 * threshold tier. Kept as a thin wrapper for legacy call sites.
 */
export const listCartShippingMethods = cache(async function (cartId: string) {
  const { shipping_options } = await listCartShippingOptions(cartId)
  return shipping_options
})
