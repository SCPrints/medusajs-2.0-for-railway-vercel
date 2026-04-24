"use client"

import type { GraphNode } from "../../../types/graph"

type Props = {
  node: GraphNode | null
  position: { x: number; y: number } | null
}

function formatPrice(price: GraphNode["price"]): string | null {
  if (!price) return null
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: price.currency_code.toUpperCase(),
    }).format(price.amount)
  } catch {
    return `${price.amount} ${price.currency_code.toUpperCase()}`
  }
}

/**
 * Absolutely-positioned hover card rendered as DOM (not on the canvas) so the
 * thumbnail and typography render crisply regardless of graph zoom.
 *
 * The parent positions the card via `position` (client coordinates). We offset
 * slightly so the pointer doesn't sit underneath the card and retrigger hover.
 */
export function GraphTooltip({ node, position }: Props) {
  if (!node || !position) return null

  const priceLabel = node.kind === "product" ? formatPrice(node.price) : null
  const kindLabel = node.kind === "product" ? "Product" : node.kind === "brand" ? "Brand" : node.kind === "category" ? "Category" : "Catalog"

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[15rem] rounded-xl border border-ui-border-base bg-ui-bg-base/95 p-3 text-left text-small-regular text-ui-fg-base shadow-xl backdrop-blur"
      style={{
        left: position.x + 14,
        top: position.y + 14,
      }}
    >
      {node.kind === "product" && node.thumbnail ? (
        <div className="mb-2 h-28 w-full overflow-hidden rounded-md bg-ui-bg-subtle">
          <img
            src={node.thumbnail}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] uppercase tracking-widest text-ui-fg-subtle">
          {kindLabel}
        </span>
        {node.productCount ? (
          <span className="text-[0.65rem] text-ui-fg-subtle">
            {node.productCount} {node.productCount === 1 ? "product" : "products"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{node.label}</p>
      {priceLabel ? (
        <p className="mt-1 text-sm font-semibold text-ui-fg-base">{priceLabel}</p>
      ) : null}
      {node.kind === "product" ? (
        <p className="mt-2 text-[0.65rem] text-ui-fg-muted">Click to open</p>
      ) : node.kind === "brand" || node.kind === "category" ? (
        <p className="mt-2 text-[0.65rem] text-ui-fg-muted">Click to expand</p>
      ) : null}
    </div>
  )
}
