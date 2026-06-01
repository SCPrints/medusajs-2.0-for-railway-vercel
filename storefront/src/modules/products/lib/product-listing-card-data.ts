import { HttpTypes } from "@medusajs/types"

import { getColorSwatchImageMap } from "@modules/products/lib/color-swatch-images"
import { sortGarmentColorLabels } from "@modules/products/lib/garment-color-order"
import {
  findFirstVariantForColorValue,
  getPrimaryGarmentImageUrl,
  isColorOptionTitle,
  toTitleSlug,
} from "@modules/products/lib/variant-options"
import { catalogSwatchBackgroundImageUrl } from "@lib/util/catalog-image-url"
import { type ListingSummary, readListingSummary } from "@lib/listing-summary"
import { getProductListingCardPriceLines } from "@lib/util/listing-card-price-text"
import { convertToLocale } from "@lib/util/money"
import { productHasTierableCost } from "@lib/util/tier-price"
import type { Tier } from "@lib/customer-tiers"
import type { VariantPrice } from "types/global"

export type ProductListingSwatch = {
  colorLabel: string
  imageUrl: string
  swatchPhotoUrl?: string
}

const MAX_SWATCHES_DISPLAY = 6

export type ProductListingCardData = {
  href: string
  title: string
  /** e.g. `From A$12.00 * ex GST` */
  priceFromLine: string
  /** e.g. `100+ A$8.00 ex GST` when bulk_pricing has a tier covering qty 100 */
  priceHundredPlusLine: string | null
  defaultImageUrl: string | null
  swatches: ProductListingSwatch[]
  /** Full garment color count (may exceed `swatches.length`). */
  totalSwatchCount: number
}

export const getColorValues = (product: HttpTypes.StoreProduct) => {
  const colorOptionIds = new Set(
    (product.options ?? [])
      .filter((option) => isColorOptionTitle(option.title))
      .map((option) => option.id)
      .filter(Boolean) as string[]
  )

  const colors = new Set<string>()

  ;(product.variants ?? []).forEach((variant) => {
    ;((variant as { options?: { option_id?: string; value?: string }[] })
      .options ?? []).forEach((optionValue) => {
      if (!optionValue?.value) {
        return
      }

      if (!colorOptionIds.size || colorOptionIds.has(optionValue.option_id!)) {
        colors.add(String(optionValue.value).trim())
      }
    })
  })

  return Array.from(colors)
}

/**
 * Build serializable props for `ProductListingCard` from a store product
 * (typically the region-priced product from `getProductsById`).
 *
 * Fast path: if `product.metadata.listing_summary` is present and validates,
 * skip the variant iteration entirely. Populated at supplier-import time for
 * AP (and any other supplier that opts in). The backend brand-products route
 * also skips variant expansion when this is available, so the whole pipeline
 * — DB query → backend response → storefront render — runs without ever
 * looking at the full variant tree.
 */
export function buildProductListingCardData(
  product: HttpTypes.StoreProduct,
  _cheapestPrice: VariantPrice | null,
  tier?: Tier | null
): ProductListingCardData {
  const handle = product.handle ?? ""

  // The listing_summary fast-path caches the *standard* cheapest/100+ amounts
  // and carries no cost — so it can't represent tier pricing. For a tier
  // customer on a product whose variants carry cost, fall through to the
  // variant route (which recomputes `cost × multiplier`). Guests, and tier
  // customers on costless products, keep the fast-path.
  const useTierVariantRoute = !!tier && productHasTierableCost(product)

  const summary = readListingSummary(product)
  if (summary && !useTierVariantRoute) {
    return buildFromListingSummary(handle, product.title, summary)
  }

  const rawColors = getColorValues(product)
  const colorOption = product.options?.find((o) =>
    isColorOptionTitle(o.title)
  )
  const colorOptionTitle = colorOption?.title
  const allColorsSorted =
    rawColors.length > 0 ? sortGarmentColorLabels([...rawColors]) : []
  const totalSwatchCount = allColorsSorted.length
  const colors = allColorsSorted.slice(0, MAX_SWATCHES_DISPLAY)
  const swatchPhotoMap =
    typeof colorOptionTitle === "string" && colorOptionTitle.length > 0
      ? getColorSwatchImageMap(product, colorOptionTitle)
      : new Map<string, string>()
  const catalogFallback = getPrimaryGarmentImageUrl(product, undefined)
  const swatches: ProductListingSwatch[] = colors.map((colorValue) => {
    const variant = findFirstVariantForColorValue(product, colorValue)
    const imageUrl =
      getPrimaryGarmentImageUrl(product, variant) ?? catalogFallback ?? ""
    const slug = toTitleSlug(colorValue)
    const rawSwatchPhotoUrl = slug ? swatchPhotoMap.get(slug) : undefined
    const swatchPhotoUrl = rawSwatchPhotoUrl
      ? catalogSwatchBackgroundImageUrl(rawSwatchPhotoUrl)
      : undefined
    return {
      colorLabel: colorValue,
      imageUrl,
      swatchPhotoUrl,
    }
  })
  const defaultImageUrl =
    swatches.length > 0
      ? swatches[0].imageUrl || catalogFallback
      : catalogFallback

  const { fromLine, hundredPlusLine } = getProductListingCardPriceLines(product, tier)

  return {
    href: `/products/${handle}`,
    title: product.title ?? "Product",
    priceFromLine: fromLine,
    priceHundredPlusLine: hundredPlusLine,
    defaultImageUrl,
    swatches,
    totalSwatchCount,
  }
}

/**
 * Fast-path card-data builder using the pre-computed listing_summary. No
 * variant iteration, no swatch-image map lookups — just sort the colours,
 * slice to MAX_SWATCHES_DISPLAY, and format the cached price amounts.
 */
function buildFromListingSummary(
  handle: string,
  title: string | null | undefined,
  summary: ListingSummary
): ProductListingCardData {
  const sortedValues =
    summary.colors.length > 0
      ? sortGarmentColorLabels(summary.colors.map((c) => c.value))
      : []
  const totalSwatchCount = sortedValues.length
  const displayValues = sortedValues.slice(0, MAX_SWATCHES_DISPLAY)

  const imageByValue = new Map<string, string>()
  for (const c of summary.colors) imageByValue.set(c.value, c.image_url)

  const swatches: ProductListingSwatch[] = displayValues.map((value) => {
    const raw = imageByValue.get(value) ?? ""
    return {
      colorLabel: value,
      imageUrl: raw,
      // Same URL drives both the hover-preview (main <Image>) and the swatch
      // background — AP doesn't have separate fabric-swatch photos, so we
      // reuse the front photo for both. catalogSwatchBackgroundImageUrl wraps
      // it in /_next/image at the swatch-circle size (w=64).
      swatchPhotoUrl: raw ? catalogSwatchBackgroundImageUrl(raw) : undefined,
    }
  })

  const defaultImageUrl =
    swatches.find((s) => s.imageUrl)?.imageUrl ?? null

  const priceFromLine = `From ${convertToLocale({
    amount: summary.cheapest_amount,
    currency_code: summary.currency_code,
  })} * ex GST`

  const priceHundredPlusLine =
    summary.hundred_plus_amount !== null
      ? `100+ ${convertToLocale({
          amount: summary.hundred_plus_amount,
          currency_code: summary.currency_code,
        })} ex GST`
      : null

  return {
    href: `/products/${handle}`,
    title: title ?? "Product",
    priceFromLine,
    priceHundredPlusLine,
    defaultImageUrl,
    swatches,
    totalSwatchCount,
  }
}
