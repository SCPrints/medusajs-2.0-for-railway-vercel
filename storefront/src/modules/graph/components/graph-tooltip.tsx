"use client"

import { useLayoutEffect, useRef, useState } from "react"

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
 * Gap between the hovered node and the edge of the tooltip card. Should be
 * larger than the biggest node radius we render so the card never sits on top
 * of a brand/category node or its label.
 */
const NODE_CLEARANCE = 28

/**
 * Absolutely-positioned hover card rendered as DOM (not on the canvas) so the
 * thumbnail and typography render crisply regardless of graph zoom.
 *
 * Placement algorithm:
 *   - Prefer to the right of the node, vertically centered. Flip to the left
 *     if it would overflow the viewport.
 *   - After placement, if it would still clip vertically, nudge it back inside
 *     the viewport.
 *   - `pointer-events-none` means hovering the card won't retrigger hover
 *     events on the underlying canvas.
 */
export function GraphTooltip({ node, position }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!position || !ref.current) {
      setPlacement(null)
      return
    }
    const card = ref.current.getBoundingClientRect()
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const margin = 8

    // Default to the right of the node, vertically centered on its midpoint.
    let left = position.x + NODE_CLEARANCE
    let top = position.y - card.height / 2

    // Flip horizontally if the card would run off the right edge.
    if (left + card.width + margin > viewportW) {
      left = position.x - NODE_CLEARANCE - card.width
    }
    // If still off-screen to the left (very cramped viewport), clamp and fall
    // back to placing above the node instead, which is always visible.
    if (left < margin) {
      left = Math.max(margin, position.x - card.width / 2)
      top = position.y - NODE_CLEARANCE - card.height
    }

    if (top < margin) top = margin
    if (top + card.height + margin > viewportH) {
      top = viewportH - card.height - margin
    }

    setPlacement({ left, top })
  }, [position, node?.id])

  if (!node || !position) return null

  const priceLabel = node.kind === "product" ? formatPrice(node.price) : null
  const kindLabel =
    node.kind === "product"
      ? "Product"
      : node.kind === "brand"
      ? "Brand"
      : node.kind === "category"
      ? "Category"
      : "Catalog"

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-50 max-w-[15rem] rounded-xl border border-ui-border-base bg-ui-bg-base/95 p-3 text-left text-small-regular text-ui-fg-base shadow-xl backdrop-blur"
      style={{
        left: placement?.left ?? position.x + NODE_CLEARANCE,
        top: placement?.top ?? position.y,
        // Hide the first paint before useLayoutEffect measures the card to
        // avoid a visible jump from the default anchor to the flipped one.
        visibility: placement ? "visible" : "hidden",
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
