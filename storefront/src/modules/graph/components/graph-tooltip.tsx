"use client"

import { useLayoutEffect, useRef, useState } from "react"

import type { GraphNode } from "../../../types/graph"
import { HUD_LABEL } from "../lib/style"

type Props = {
  node: GraphNode | null
  position: { x: number; y: number } | null
}

/** Gap between the hovered node and the card — larger than the biggest planet. */
const NODE_CLEARANCE = 28

const KIND_LABEL: Record<GraphNode["kind"], string> = {
  root: "Catalog",
  brand: "Planet · brand",
  category: "Moon · category",
  type: "Beacon · product type",
  tag: "Star · tag",
  product: "Product",
}

/**
 * DOM hover card (not canvas) so the thumbnail and type render crisply at any
 * zoom. Prefers the right of the node, flips left, then clamps into the viewport.
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
    const margin = 8
    let left = position.x + NODE_CLEARANCE
    let top = position.y - card.height / 2
    if (left + card.width + margin > window.innerWidth) left = position.x - NODE_CLEARANCE - card.width
    if (left < margin) {
      left = Math.max(margin, position.x - card.width / 2)
      top = position.y - NODE_CLEARANCE - card.height
    }
    if (top < margin) top = margin
    if (top + card.height + margin > window.innerHeight) top = window.innerHeight - card.height - margin
    setPlacement({ left, top })
  }, [position, node?.id])

  if (!node || !position) return null

  const expands = node.kind === "brand" || node.kind === "category" || node.kind === "type" || node.kind === "tag"

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-50 max-w-[15rem] rounded-xl border border-[#45A29E]/40 bg-[#0B0C10]/90 p-3 text-left text-small-regular !text-[#C5C6C7] shadow-[0_0_24px_rgba(69,162,158,0.2)] backdrop-blur"
      style={{
        left: placement?.left ?? position.x + NODE_CLEARANCE,
        top: placement?.top ?? position.y,
        visibility: placement ? "visible" : "hidden",
      }}
    >
      {node.kind === "product" && node.thumbnail ? (
        <div className="mb-2 h-28 w-full overflow-hidden rounded-md bg-[#1F2833]">
          <img src={node.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className={HUD_LABEL}>{KIND_LABEL[node.kind]}</span>
        {node.productCount ? (
          <span className="text-[0.65rem] !text-[#C5C6C7]/70">
            {node.productCount} {node.productCount === 1 ? "product" : "products"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium !text-white">{node.label}</p>
      {node.kind === "product" ? (
        <p className="mt-2 text-[0.65rem] !text-[#C5C6C7]/60">Click to open</p>
      ) : expands ? (
        <p className="mt-2 text-[0.65rem] !text-[#C5C6C7]/60">Click to orbit its products</p>
      ) : null}
    </div>
  )
}
