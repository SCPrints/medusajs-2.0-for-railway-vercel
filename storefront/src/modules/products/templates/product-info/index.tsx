import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductTags from "@modules/products/components/product-tags"
import { getStoreProductTagValues } from "@lib/util/product-tags"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const sanitizeDescriptionHtml = (description: string) => {
  return description
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  const description = product.description?.trim() ?? ""
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(description)
  const tagLabels = getStoreProductTagValues(product)

  return (
    <header id="product-info" className="flex flex-col gap-y-3">
      {product.collection && (
        <LocalizedClientLink
          href={`/collections/${product.collection.handle}`}
          className="text-medium text-ui-fg-muted hover:text-ui-fg-subtle"
        >
          {product.collection.title}
        </LocalizedClientLink>
      )}
      <Heading
        level="h1"
        className="text-3xl leading-tight text-ui-fg-base lg:text-4xl"
        data-testid="product-title"
      >
        {product.title}
      </Heading>

      <ProductTags labels={tagLabels} />

      {description ? (
        hasHtml ? (
          <div
            className="text-medium max-w-3xl text-ui-fg-subtle [&_p]:mb-3 [&_p:last-child]:mb-0 [&_span]:text-inherit"
            data-testid="product-description"
            dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(description) }}
          />
        ) : (
          <Text
            className="text-medium max-w-3xl text-ui-fg-subtle whitespace-pre-line"
            data-testid="product-description"
          >
            {description}
          </Text>
        )
      ) : null}
    </header>
  )
}

export default ProductInfo
