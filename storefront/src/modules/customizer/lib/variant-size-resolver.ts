import { HttpTypes } from "@medusajs/types"

import { SizeQuantity } from "@modules/customizer/lib/types"
import { sortApparelSizeLabels } from "@modules/products/lib/apparel-size-order"

/**
 * Variant + size resolver bundle used by the customizer's product picker.
 *
 * The customizer treats a product's "size" option as the user-facing axis
 * (the size matrix in the wizard) and all other options as "colour-locked"
 * — i.e. the customer picks a colour once on Step 1, then the size picker
 * stays narrowed to that colour. Every helper in this file enforces that
 * mental model: take a `reference` variant (the chosen colour), then enumerate
 * variants that match it on every non-size option.
 *
 * Pricing nuance: `variantHasConfiguredPrice` is used to push variants that
 * don't have a real `calculated_price` (legacy or staging data) down the
 * preference ranking. They still show up if they're the only match, but a
 * variant with real pricing wins ties.
 */

/**
 * A variant is "configured" when Medusa surfaces a real price for it — either
 * a `calculated_price.calculated_amount` from the price-list resolution path,
 * or any entry in the legacy `prices[]` array with a numeric `amount`.
 * Variants without either still exist (legacy imports, in-flight data
 * corrections) but they break the cart flow, so we de-prioritise them
 * everywhere — size matrix population, default-variant selection, option
 * change resolution.
 */
export const variantHasConfiguredPrice = (variant?: HttpTypes.StoreProductVariant) => {
  const variantRecord = variant as any
  if (typeof variantRecord?.calculated_price?.calculated_amount === "number") {
    return true
  }
  return Array.isArray(variantRecord?.prices)
    ? variantRecord.prices.some((price: any) => typeof price?.amount === "number")
    : false
}

/** The product option named "Size" (case-insensitive substring match). */
export const getSizeOption = (product: HttpTypes.StoreProduct) =>
  product.options?.find((option) => (option.title ?? "").toLowerCase().includes("size"))

/** Every product option EXCEPT the size axis. */
export const getNonSizeOptions = (product: HttpTypes.StoreProduct) =>
  (product.options ?? []).filter((option) => !(option.title ?? "").toLowerCase().includes("size"))

/**
 * Returns true if `variant` matches the `reference` variant on every non-size
 * option. Used to filter to the colour-locked pool before enumerating sizes.
 */
export const variantMatchesNonSizeOptions = (
  variant: HttpTypes.StoreProductVariant,
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant
) => {
  const nonSize = getNonSizeOptions(product)
  const refMap = new Map(
    (reference.options ?? []).map((entry) => [entry.option_id, entry.value ?? ""])
  )
  return nonSize.every((opt) => {
    const want = refMap.get(opt.id) ?? ""
    const got = variant.options?.find((e) => e.option_id === opt.id)?.value ?? ""
    return want === got
  })
}

/**
 * Build the SizeQuantity[] seed for the size matrix — one entry per size value
 * available under the reference variant's colour, sorted in apparel order
 * (XS → 5XL etc.).
 */
export const uniqueSizesForVariant = (
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant
): SizeQuantity[] => {
  const sizeOption = getSizeOption(product)
  const basePool = (product.variants ?? []).filter((v) =>
    variantMatchesNonSizeOptions(v, product, reference)
  )
  const pricedPool = basePool.filter((variant) => variantHasConfiguredPrice(variant))
  const pool = pricedPool.length ? pricedPool : basePool
  const seen = new Set<string>()
  const sizes: string[] = []
  for (const v of pool) {
    const sizeValue = sizeOption
      ? (v.options?.find((e) => e.option_id === sizeOption.id)?.value ?? "")
      : (v.title ?? "Default")
    if (!sizeValue || seen.has(sizeValue)) {
      continue
    }
    seen.add(sizeValue)
    sizes.push(sizeValue)
  }
  if (!sizes.length) {
    return [{ size: "Default", quantity: 0 }]
  }
  return sortApparelSizeLabels(sizes).map((size) => ({ size, quantity: 0 }))
}

/**
 * Mirror of `uniqueSizesForVariant` that returns the actual variant per
 * size value, so callers can look up inventory state. Same non-size matching
 * so colour-locked size pickers resolve to the variant that would actually be
 * added to the cart.
 */
export const variantBySizeForReference = (
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant
): Map<string, HttpTypes.StoreProductVariant> => {
  const sizeOption = getSizeOption(product)
  const basePool = (product.variants ?? []).filter((v) =>
    variantMatchesNonSizeOptions(v, product, reference)
  )
  const pricedPool = basePool.filter((variant) => variantHasConfiguredPrice(variant))
  const pool = pricedPool.length ? pricedPool : basePool
  const map = new Map<string, HttpTypes.StoreProductVariant>()
  for (const v of pool) {
    const sizeValue = sizeOption
      ? (v.options?.find((e) => e.option_id === sizeOption.id)?.value ?? "")
      : (v.title ?? "Default")
    if (!sizeValue || map.has(sizeValue)) continue
    map.set(sizeValue, v)
  }
  return map
}

/**
 * Unique values for any one option (e.g. all available colours across the
 * variants). Natural-numeric sort so "S, M, L, XL, 2XL, 3XL" — and any
 * numbered option — orders sensibly.
 */
export const uniqueOptionValues = (product: HttpTypes.StoreProduct, optionId: string): string[] => {
  const values = new Set<string>()
  for (const v of product.variants ?? []) {
    const val = v.options?.find((e) => e.option_id === optionId)?.value
    if (val) {
      values.add(val)
    }
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/**
 * When the customer changes one option (e.g. picks a new colour), resolve to
 * the best matching variant — preserving the current size if the new colour
 * stocks it, otherwise relaxing the size match. Priced variants always beat
 * unpriced ones; within each tier the original Medusa variant order wins.
 */
export const findVariantAfterOptionChange = (
  product: HttpTypes.StoreProduct,
  reference: HttpTypes.StoreProductVariant,
  optionId: string,
  newValue: string
): HttpTypes.StoreProductVariant | undefined => {
  const sizeOption = getSizeOption(product)
  const currentSize = sizeOption
    ? reference.options?.find((e) => e.option_id === sizeOption.id)?.value
    : undefined
  const refMap = new Map(
    (reference.options ?? []).map((e) => [e.option_id, e.value ?? ""])
  )
  const nonSize = getNonSizeOptions(product)
  const matches = (v: HttpTypes.StoreProductVariant, relaxSize: boolean) => {
    if (v.options?.find((e) => e.option_id === optionId)?.value !== newValue) {
      return false
    }
    if (sizeOption && currentSize && !relaxSize) {
      const sv = v.options?.find((e) => e.option_id === sizeOption.id)?.value
      if (sv !== currentSize) {
        return false
      }
    }
    return nonSize.every((opt) => {
      if (opt.id === optionId) {
        return true
      }
      const want = refMap.get(opt.id) ?? ""
      const got = v.options?.find((e) => e.option_id === opt.id)?.value ?? ""
      return want === got
    })
  }
  const strictMatches = (product.variants ?? []).filter((v) => matches(v, false))
  const relaxedMatches = (product.variants ?? []).filter((v) => matches(v, true))
  return (
    strictMatches.find((variant) => variantHasConfiguredPrice(variant)) ??
    relaxedMatches.find((variant) => variantHasConfiguredPrice(variant)) ??
    strictMatches[0] ??
    relaxedMatches[0]
  )
}
