import { Text } from "@medusajs/ui"

import { getProductPrice } from "@lib/util/get-product-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import { getProductsById } from "@lib/data/products"
import { getCustomerTier } from "@lib/data/customer-tier"
import type { Tier } from "@lib/customer-tiers"
import { HttpTypes } from "@medusajs/types"
import ProductTags from "@modules/products/components/product-tags"
import { getStoreProductTagValues } from "@lib/util/product-tags"
import ProductListingCard from "@modules/products/components/product-listing-card"
import { buildProductListingCardData } from "@modules/products/lib/product-listing-card-data"

/** Medusa list responses include `calculated_price`; avoid N+1 `getProductsById` per tile.
 *  Products with a precomputed `metadata.listing_summary` (the brand-listing
 *  fast-path) carry their cheapest amount inside the summary, so an empty
 *  variants array is fine — never refetch when that's present. */
function productHasRegionalPrices(product: HttpTypes.StoreProduct): boolean {
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  if (meta.listing_summary) return true
  return (product.variants ?? []).some(
    (v) =>
      (v as { calculated_price?: { calculated_amount?: unknown } })
        ?.calculated_price?.calculated_amount != null
  )
}

export default async function ProductPreview({
  product,
  isFeatured,
  region,
  layout = "default",
  tier: tierProp,
  imagePriority,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
  layout?: "default" | "boxed"
  /**
   * Optional pre-resolved customer tier from the parent. When rendered as part
   * of a product grid (PaginatedProducts / featured rails), the parent fetches
   * the tier once and passes it down so we don't re-await React.cache for
   * every one of N tiles. Falls back to a per-tile lookup for callers that
   * don't pass it (e.g. single-product previews on the home page).
   */
  tier?: Tier | null
  /**
   * Set for the first row of a grid so the tile image fetches eagerly with
   * fetchpriority=high — the grid image is the field-LCP element on listing
   * pages and the lazy default delays it until post-hydration.
   */
  imagePriority?: boolean
}) {
  // Resolve tier from the prop if the parent fed it in; otherwise fall back
  // to a per-tile fetch (React.cache deduplicates within a request).
  const tierPromise =
    tierProp !== undefined ? Promise.resolve(tierProp) : getCustomerTier()

  const [pricedProductResolved, tier] = await Promise.all([
    productHasRegionalPrices(product)
      ? Promise.resolve(product)
      : getProductsById({ ids: [product.id!], regionId: region.id }).then(
          (list) => list[0]
        ),
    tierPromise,
  ])
  const pricedProduct = pricedProductResolved

  if (!pricedProduct) {
    return null
  }

  const { cheapestPrice } = getProductPrice({
    product: pricedProduct,
    tier,
  })

  const tagLabels = getStoreProductTagValues(pricedProduct)

  if (layout === "boxed") {
    const cardData = buildProductListingCardData(
      pricedProduct,
      cheapestPrice,
      tier
    )
    return (
      <ProductListingCard
        className="h-full"
        {...cardData}
        imagePriority={imagePriority}
      />
    )
  }

  const gridThumbSizes = isFeatured
    ? "(max-width: 576px) 50vw, (max-width: 992px) 40vw, 400px"
    : "(max-width: 576px) 50vw, (max-width: 992px) 33vw, 260px"

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="group block transform-gpu transition-transform duration-200 ease-out motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.01]"
    >
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
          sizes={gridThumbSizes}
          priority={imagePriority}
          alt={product.title}
        />
        <div className="flex txt-compact-medium mt-4 justify-between">
          <Text className="text-ui-fg-subtle" data-testid="product-title">
            {product.title}
          </Text>
          <div className="flex items-center gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
        <ProductTags labels={tagLabels} className="mt-2" />
      </div>
    </LocalizedClientLink>
  )
}
