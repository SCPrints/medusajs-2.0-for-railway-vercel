import type { HttpTypes } from "@medusajs/types"

import {
  buildColorNeedlesForRelaxedMatch,
  findProductOptionByTitle,
  getGarmentSwatchImageUrlFromMetadata,
  getVariantOptionValue,
  toTitleSlug,
  urlMatchesColorAmongSiblings,
  urlMatchesColorNeedles,
} from "@modules/products/lib/variant-options"

/**
 * Map colour slug → best-effort swatch photo URL (variant metadata or product image filename),
 * same logic as the PDP colour picker.
 */
// One result per product object and option: the swatches re-render on every hover and
// option change, and the Staple Tee (70 colours × 570 variants × 93 photos) took ~35 ms a
// call on an M1, ~150 ms on a phone (profiled 2026-11-12). Callers only read the map.
const cache = new WeakMap<HttpTypes.StoreProduct, Map<string, Map<string, string>>>()

export function getColorSwatchImageMap(
  product: HttpTypes.StoreProduct,
  optionTitle: string
): Map<string, string> {
  let byTitle = cache.get(product)
  if (!byTitle) cache.set(product, (byTitle = new Map()))
  let map = byTitle.get(optionTitle)
  if (!map) byTitle.set(optionTitle, (map = buildColorSwatchImageMap(product, optionTitle)))
  return map
}

function buildColorSwatchImageMap(
  product: HttpTypes.StoreProduct,
  optionTitle: string
): Map<string, string> {
  const swatchImageMap = new Map<string, string>()
  const optionDef = findProductOptionByTitle(product, optionTitle)
  if (!optionDef) {
    return swatchImageMap
  }

  // Every colour on this option — sibling-aware matching needs the full list
  // so "Camo" can't claim the "Black Camo" files (and vice-versa patterns).
  const allColorLabels = (optionDef.values ?? [])
    .map((v) => v.value ?? "")
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)

  // Variants grouped by colour slug in one pass (was a full variant scan per colour).
  const variantsBySlug = new Map<string, HttpTypes.StoreProductVariant[]>()
  for (const variant of product.variants ?? []) {
    const colorValue = getVariantOptionValue(variant, optionTitle, product)
    if (typeof colorValue !== "string") continue
    const slug = toTitleSlug(colorValue)
    const list = variantsBySlug.get(slug)
    if (list) list.push(variant)
    else variantsBySlug.set(slug, [variant])
  }

  for (const optionValue of optionDef.values ?? []) {
    const rawValue = optionValue.value ?? ""
    const key = toTitleSlug(rawValue)

    if (!key) {
      continue
    }

    const variantsForColor = variantsBySlug.get(key) ?? []

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
      urlMatchesColorAmongSiblings(url, rawValue, allColorLabels)
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
          typeof url === "string" &&
          urlMatchesColorAmongSiblings(url, rawValue, allColorLabels)
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
