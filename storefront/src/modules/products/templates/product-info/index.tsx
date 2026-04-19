import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

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

  return (
    <div id="product-info">
      <div className="flex flex-col gap-y-4 lg:max-w-[500px] mx-auto">
        {product.collection && (
          <LocalizedClientLink
            href={`/collections/${product.collection.handle}`}
            className="text-medium text-ui-fg-muted hover:text-ui-fg-subtle"
          >
            {product.collection.title}
          </LocalizedClientLink>
        )}
        <Heading
          level="h2"
          className="text-3xl leading-10 text-ui-fg-base"
          data-testid="product-title"
        >
          {product.title}
        </Heading>

        {hasHtml ? (
          <div
            className="text-medium text-ui-fg-subtle [&_p]:mb-3 [&_p:last-child]:mb-0 [&_span]:text-inherit"
            data-testid="product-description"
            dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(description) }}
          />
        ) : (
          <Text
            className="text-medium text-ui-fg-subtle whitespace-pre-line"
            data-testid="product-description"
          >
            {description}
          </Text>
        )}
      </div>
    </div>
  )
}

export default ProductInfo
