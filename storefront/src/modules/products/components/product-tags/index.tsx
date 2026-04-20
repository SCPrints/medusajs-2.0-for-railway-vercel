import LocalizedClientLink from "@modules/common/components/localized-client-link"

type ProductTagsProps = {
  labels: string[]
  className?: string
  linked?: boolean
}

const ProductTags = ({ labels, className = "", linked = true }: ProductTagsProps) => {
  if (!labels.length) {
    return null
  }

  return (
    <ul
      className={`m-0 flex list-none flex-wrap gap-2 p-0 ${className}`.trim()}
      aria-label="Product tags"
      data-testid="product-tags"
    >
      {labels.map((label) => (
        <li key={label}>
          {linked ? (
            <LocalizedClientLink
              href={`/store?tag=${encodeURIComponent(label)}`}
              className="inline-flex rounded-full border border-ui-border-base bg-ui-bg-subtle px-2.5 py-0.5 text-xs font-medium text-ui-fg-subtle transition-colors hover:border-ui-fg-base hover:text-ui-fg-base"
            >
              {label}
            </LocalizedClientLink>
          ) : (
            <span className="inline-flex rounded-full border border-ui-border-base bg-ui-bg-subtle px-2.5 py-0.5 text-xs font-medium text-ui-fg-subtle">
              {label}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export default ProductTags
