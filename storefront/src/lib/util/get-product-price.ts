import { HttpTypes } from "@medusajs/types"
import { getPercentageDiff } from "./get-precentage-diff"
import { convertMinorToLocale } from "./money"
import { getFirstBulkTierMinor, resolveHeadlineMinorAmount } from "./resolve-display-minor"

export const getPricesForVariant = (variant: any) => {
  if (!variant?.calculated_price?.calculated_amount) {
    return null
  }

  const calculatedMinor = variant.calculated_price.calculated_amount
  const displayMinor = resolveHeadlineMinorAmount(
    getFirstBulkTierMinor(variant),
    calculatedMinor
  )

  return {
    /** Minor units (smallest currency amount), raw Medusa API value. */
    calculated_price_number: calculatedMinor,
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
    price_type: variant.calculated_price.calculated_price.price_list_type,
    percentage_diff: getPercentageDiff(
      variant.calculated_price.original_amount,
      calculatedMinor
    ),
  }
}

export function getProductPrice({
  product,
  variantId,
}: {
  product: HttpTypes.StoreProduct
  variantId?: string
}) {
  if (!product || !product.id) {
    throw new Error("No product provided")
  }

  const cheapestPrice = () => {
    if (!product || !product.variants?.length) {
      return null
    }

    const displayMinor = (v: any) =>
      resolveHeadlineMinorAmount(
        getFirstBulkTierMinor(v),
        v.calculated_price?.calculated_amount
      )

    const cheapestVariant: any = product.variants
      .filter((v: any) => !!v.calculated_price)
      .sort((a: any, b: any) => displayMinor(a) - displayMinor(b))[0]

    return getPricesForVariant(cheapestVariant)
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

    return getPricesForVariant(variant)
  }

  return {
    product,
    cheapestPrice: cheapestPrice(),
    variantPrice: variantPrice(),
  }
}
