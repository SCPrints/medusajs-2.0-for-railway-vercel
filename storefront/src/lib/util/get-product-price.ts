import { HttpTypes } from "@medusajs/types"
import { getPercentageDiff } from "./get-precentage-diff"
import { convertMinorToLocale } from "./money"
import { resolveDisplayMinorForVariant } from "./resolve-display-minor"
import { getTierUnitMajorForVariant } from "./tier-price"
import type { Tier } from "@lib/customer-tiers"

/**
 * Force-set product handle on a variant so downstream `resolveDisplayMinorForVariant`
 * can apply the AS Colour AUD hundredfold fix. Medusa sometimes returns a partial
 * `variant.product` (id only, no handle) — merging instead of short-circuiting avoids
 * silently dropping the handle and defeating the finalizer.
 */
const variantWithProductHandle = (product: HttpTypes.StoreProduct, variant: any) => ({
  ...variant,
  product: {
    ...(variant?.product ?? {}),
    handle:
      (typeof variant?.product?.handle === "string" && variant.product.handle) ||
      product?.handle,
  },
})

/** Resolved unit minor for UI (bulk vs Medusa + AS Colour AUD hundredfold when both are wrong). */
export const getDisplayUnitMinorForVariant = (variant: any) => resolveDisplayMinorForVariant(variant)

export const getPricesForVariant = (variant: any, tier?: Tier | null) => {
  if (!variant?.calculated_price?.calculated_amount) {
    return null
  }

  // With an active tier (and a costed variant), the displayed unit becomes the
  // flat `cost × multiplier` tier price; `calculated_price_number` follows it so
  // headline/total math downstream uses the same number checkout will charge.
  const displayMinor = resolveDisplayMinorForVariant(variant, tier)
  const tierActive = getTierUnitMajorForVariant(variant, tier) != null
  const calculatedMinor = tierActive
    ? displayMinor
    : variant.calculated_price.calculated_amount

  return {
    /** Medusa `calculated_amount`, or the tier unit when a tier is active. */
    calculated_price_number: calculatedMinor,
    /** Resolved unit minor for totals / line math — same basis as `calculated_price` string. */
    display_unit_minor: displayMinor,
    /** Locale string using resolved display minor (bulk vs calculated when metadata scale is off). */
    calculated_price: convertMinorToLocale({
      amount: displayMinor,
      currency_code: variant.calculated_price.currency_code,
    }),
    original_price_number: variant.calculated_price.original_amount,
    original_price: convertMinorToLocale({
      amount: variant.calculated_price.original_amount,
      currency_code: variant.calculated_price.currency_code,
    }),
    currency_code: variant.calculated_price.currency_code,
    // Tier pricing is a flat override, never a "sale" — don't trigger sale styling.
    price_type: tierActive
      ? "default"
      : variant.calculated_price.calculated_price.price_list_type,
    percentage_diff: getPercentageDiff(
      variant.calculated_price.original_amount,
      calculatedMinor
    ),
  }
}

export function getProductPrice({
  product,
  variantId,
  tier = null,
}: {
  product: HttpTypes.StoreProduct
  variantId?: string
  /** Logged-in customer's pricing tier — applies the flat tier price when set. */
  tier?: Tier | null
}) {
  if (!product || !product.id) {
    throw new Error("No product provided")
  }

  const cheapestPrice = () => {
    if (!product || !product.variants?.length) {
      return null
    }

    const displayMinor = (v: any) =>
      resolveDisplayMinorForVariant(variantWithProductHandle(product, v), tier)

    const cheapestVariant: any = product.variants
      .filter((v: any) => !!v.calculated_price)
      .sort((a: any, b: any) => displayMinor(a) - displayMinor(b))[0]

    return getPricesForVariant(variantWithProductHandle(product, cheapestVariant), tier)
  }

  const variantPrice = () => {
    if (!product || !variantId) {
      return null
    }

    const variant: any = product.variants?.find(
      (v) => v.id === variantId || v.sku === variantId
    )

    if (!variant) {
      return null
    }

    return getPricesForVariant(variantWithProductHandle(product, variant), tier)
  }

  return {
    product,
    cheapestPrice: cheapestPrice(),
    variantPrice: variantPrice(),
  }
}
