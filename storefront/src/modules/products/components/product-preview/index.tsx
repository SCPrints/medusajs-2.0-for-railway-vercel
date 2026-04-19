import { Text } from "@medusajs/ui"

import { getProductPrice } from "@lib/util/get-product-price"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import { getProductsById } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"

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
  const [pricedProduct] = await getProductsById({
    ids: [product.id!],
    regionId: region.id,
  })

  if (!pricedProduct) {
    return null
  }

  const { cheapestPrice } = getProductPrice({
    product: pricedProduct,
  })

  if (layout === "boxed") {
    return (
      <LocalizedClientLink href={`/products/${product.handle}`} className="group block h-full">
        <article
          className="h-full rounded-xl border border-ui-border-base bg-white p-4 transform-gpu transition-all duration-200 ease-out hover:border-[var(--brand-secondary)]/55 hover:shadow-elevation-card-hover motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.01]"
          data-testid="product-wrapper"
        >
          <Thumbnail
            thumbnail={product.thumbnail}
            images={product.images}
            size="square"
            className="rounded-lg"
          />
          <div className="mt-4 flex items-start justify-between gap-x-3">
            <Text className="text-sm font-medium text-ui-fg-base" data-testid="product-title">
              {product.title}
            </Text>
            <div className="shrink-0">
              {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
            </div>
          </div>
        </article>
      </LocalizedClientLink>
    )
  }

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
        />
        <div className="flex txt-compact-medium mt-4 justify-between">
          <Text className="text-ui-fg-subtle" data-testid="product-title">
            {product.title}
          </Text>
          <div className="flex items-center gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
