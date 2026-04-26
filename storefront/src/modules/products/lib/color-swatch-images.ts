import type { HttpTypes } from "@medusajs/types"

import {
  buildColorNeedlesForRelaxedMatch,
  findProductOptionByTitle,
  getGarmentSwatchImageUrlFromMetadata,
  getVariantOptionValue,
  toTitleSlug,
  urlMatchesColorLabelStrict,
  urlMatchesColorNeedles,
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
      const colorValue = getVariantOptionValue(variant, optionTitle, product)
      return typeof colorValue === "string" && toTitleSlug(colorValue) === key
    })

    const metadataFromVariants = variantsForColor
      .map((variant: HttpTypes.StoreProductVariant) =>
        getGarmentSwatchImageUrlFromMetadata(
          ((variant as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<
            string,
            unknown
          >
        )
      )
      .filter((url): url is string => typeof url === "string" && url.length > 0)

    const strictMeta = metadataFromVariants.find((url) =>
      urlMatchesColorLabelStrict(url, rawValue)
    )
    const swatchFromMeta = strictMeta ?? metadataFromVariants[0]

    if (swatchFromMeta) {
      swatchImageMap.set(key, swatchFromMeta)
      continue
    }

    const strictProduct = (product.images ?? [])
      .map((image) => image.url)
      .find(
        (url) =>
          typeof url === "string" && urlMatchesColorLabelStrict(url, rawValue)
      )

    if (strictProduct) {
      swatchImageMap.set(key, strictProduct)
      continue
    }

    const relaxedNeedles = buildColorNeedlesForRelaxedMatch(rawValue)
    const relaxedProduct = (product.images ?? [])
      .map((image) => image.url)
      .find(
        (url) =>
          typeof url === "string" && urlMatchesColorNeedles(url, relaxedNeedles)
      )

    if (relaxedProduct) {
      swatchImageMap.set(key, relaxedProduct)
    }
  }

  return swatchImageMap
}
