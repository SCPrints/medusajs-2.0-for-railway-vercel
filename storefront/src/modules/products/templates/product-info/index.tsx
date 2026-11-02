import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import sanitizeHtml from "sanitize-html"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductTags from "@modules/products/components/product-tags"
import SizeGuide from "@modules/products/components/size-guide"
import { getStoreProductTagValues } from "@lib/util/product-tags"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
  /**
   * Skip rendering the H1 title. Set when ProductInfo is rendered
   * below the customizer on the PDP — the page already shows the
   * garment name in a dedicated header above the design surface, so
   * including it again here would duplicate it.
   */
  hideTitle?: boolean
}

/**
 * Allowlist-based sanitizer for product description HTML.
 *
 * Descriptions are written by supplier importers (AS Colour / FashionBiz /
 * Gildan) and AI-copy drafts — not exclusively hand-trusted admins — so this
 * is rendered via dangerouslySetInnerHTML and MUST be sanitized with an
 * allowlist. The previous denylist regex was trivially bypassable
 * (`<img src=x onerror=...>` with unquoted/whitespaced handlers, `<svg onload>`,
 * entity-encoded `javascript:`), which is a stored-XSS vector. sanitize-html
 * strips everything not explicitly permitted below.
 */
const DESCRIPTION_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "span",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
  },
  // Only safe URL schemes — blocks javascript:/data:/vbscript: hrefs.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  // Force external links to be safe.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
    }),
  },
  disallowedTagsMode: "discard",
}

const sanitizeDescriptionHtml = (description: string) =>
  sanitizeHtml(description, DESCRIPTION_SANITIZE_OPTIONS)

const ProductInfo = ({ product, hideTitle = false }: ProductInfoProps) => {
  const description = product.description?.trim() ?? ""
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(description)
  const tagLabels = getStoreProductTagValues(product)
  const rawBrand = (product as any).brand
  const brand: { handle?: string | null; name?: string | null } | undefined =
    Array.isArray(rawBrand) ? rawBrand[0] : rawBrand

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
      {hideTitle ? null : (
        <Heading
          level="h1"
          className="text-3xl leading-tight text-ui-fg-base lg:text-4xl"
          data-testid="product-title"
        >
          {product.title}
        </Heading>
      )}

      {/* Every product links its brand page so searches like "shaka wear" land
          there instead of on the home page. */}
      {brand?.handle && brand.name ? (
        <LocalizedClientLink
          href={`/brands/${brand.handle}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold !text-ui-fg-base underline underline-offset-4 hover:!text-brand"
          data-testid="product-brand-link"
        >
          Shop all {brand.name} →
        </LocalizedClientLink>
      ) : null}

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

      <SizeGuide product={product} />
    </header>
  )
}

export default ProductInfo
