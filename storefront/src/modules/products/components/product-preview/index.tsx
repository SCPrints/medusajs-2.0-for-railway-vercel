import { Text } from "@medusajs/ui"

import { getProductPrice } from "@lib/util/get-product-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import { getProductsById } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import ProductTags from "@modules/products/components/product-tags"
import { getStoreProductTagValues } from "@lib/util/product-tags"
import ProductListingCard from "@modules/products/components/product-listing-card"
import { buildProductListingCardData } from "@modules/products/lib/product-listing-card-data"

/** Medusa list responses include `calculated_price`; avoid N+1 `getProductsById` per tile. */
function productHasRegionalPrices(product: HttpTypes.StoreProduct): boolean {
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
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
  layout?: "default" | "boxed"
}) {
  const pricedProduct = productHasRegionalPrices(product)
    ? product
    : (
        await getProductsById({
          ids: [product.id!],
          regionId: region.id,
        })
      )[0]

  if (!pricedProduct) {
    return null
  }

  const { cheapestPrice } = getProductPrice({
    product: pricedProduct,
  })

  const tagLabels = getStoreProductTagValues(pricedProduct)

  if (layout === "boxed") {
    const cardData = buildProductListingCardData(
      pricedProduct,
      cheapestPrice
    )
    return <ProductListingCard className="h-full" {...cardData} />
  }

  const gridThumbSizes = isFeatured
    ? "(max-width: 576px) 50vw, (max-width: 992px) 40vw, 400px"
    : "(max-width: 576px) 50vw, (max-width: 992px) 33vw, 260px"

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      prefetch={false}
      className="group block transform-gpu transition-transform duration-200 ease-out motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.01]"
    >
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
          sizes={gridThumbSizes}
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
