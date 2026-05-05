import { HttpTypes } from "@medusajs/types"

import { getDisplayUnitMinorForVariant, getPricesForVariant } from "@lib/util/get-product-price"

/** Merge common PDP fallbacks so AS Colour pricing finalizers still run on cart lines. */
export function variantWithInferredHandleForLineItem(
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
): unknown {
  const itemRecord = item as unknown as {
    variant?: Record<string, unknown> & { product?: { handle?: string } }
    product_handle?: string
    metadata?: Record<string, unknown>
  }
  const inferredHandle =
    (typeof itemRecord.variant?.product?.handle === "string" &&
      itemRecord.variant.product.handle) ||
    (typeof itemRecord.product_handle === "string" && itemRecord.product_handle) ||
    (typeof itemRecord.metadata?.product_handle === "string" &&
      (itemRecord.metadata.product_handle as string)) ||
    undefined
  const variantForPricing = inferredHandle
    ? {
        ...(itemRecord.variant as Record<string, unknown>),
        product: {
          ...(itemRecord.variant?.product ?? {}),
          handle: inferredHandle,
        },
      }
    : itemRecord.variant
  return variantForPricing
}

/** Cart line added via SCP `/store/carts/:id/scp-line-items` carries Medusa custom unit pricing. */
export function cartLineUsesExplicitUnitPrice(
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
): boolean {
  const rec = item as { is_custom_price?: boolean; unit_price?: unknown }
  return (
    rec.is_custom_price === true &&
    typeof rec.unit_price === "number" &&
    Number.isFinite(rec.unit_price)
  )
}

export function resolveCartLineDisplayUnitMinor(
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem,
  variantForPricing: unknown
): number {
  if (cartLineUsesExplicitUnitPrice(item)) {
    const v = (item as { unit_price: number }).unit_price
    return typeof v === "number" && Number.isFinite(v) ? v : 0
  }
  const v = variantForPricing as {
    calculated_price?: { calculated_amount?: number }
  }
  if (!v?.calculated_price?.calculated_amount) {
    return 0
  }
  return getDisplayUnitMinorForVariant(v)
}

/** Locale + comparison helpers for components that previously called `getPricesForVariant` directly. */
export function getPricesForCartLineVariant(variantForPricing: unknown) {
  return getPricesForVariant(variantForPricing)
}
