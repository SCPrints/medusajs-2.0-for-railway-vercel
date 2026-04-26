import type { HttpTypes } from "@medusajs/types"

import {
  findProductOptionByTitle,
  getGarmentSwatchImageUrlFromMetadata,
  getVariantOptionValue,
  toTitleSlug,
  urlMatchesColorLabelStrict,
} from "@modules/products/lib/variant-options"

/**
 * Map colour slug → best-effort swatch photo URL (variant metadata or product image filename),
 * same logic as the PDP colour picker.
 */
export function getColorSwatchImageMap(
  product: HttpTypes.StoreProduct,
  optionTitle: string
): Map<string, string> {
  const swatchImageMap = new Map<string, string>()
  const optionDef = findProductOptionByTitle(product, optionTitle)
  if (!optionDef) {
    return swatchImageMap
  }

  for (const optionValue of optionDef.values ?? []) {
    const rawValue = optionValue.value ?? ""
    const key = toTitleSlug(rawValue)

    if (!key) {
      continue
    }

    const variantsForColor = (product.variants ?? []).filter((variant) => {
      const colorValue = getVariantOptionValue(variant, optionTitle)
      return typeof colorValue === "string" && toTitleSlug(colorValue) === key
    })

    const matchedMetadataImage = variantsForColor
      .map((variant: HttpTypes.StoreProductVariant) =>
        getGarmentSwatchImageUrlFromMetadata(
          ((variant as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<
            string,
            unknown
          >
        )
      )
      .find(
        (url): url is string =>
          typeof url === "string" && url.length > 0 && urlMatchesColorLabelStrict(url, rawValue)
      )

    if (matchedMetadataImage) {
      swatchImageMap.set(key, matchedMetadataImage)
      continue
    }

    const matchedProductImage = (product.images ?? [])
      .map((image) => image.url)
      .find((url) => {
        return typeof url === "string" && urlMatchesColorLabelStrict(url, rawValue)
      })

    if (matchedProductImage) {
      swatchImageMap.set(key, matchedProductImage)
    }
  }

  return swatchImageMap
}
