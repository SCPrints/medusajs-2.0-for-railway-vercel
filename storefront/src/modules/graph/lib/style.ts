import type { NodeKind } from "../../../types/graph"

export type NodeStyle = {
  fill: string
  stroke: string
  baseRadius: number
  labelColor: string
}

/**
 * Visual tokens for each node kind. Colors are hard-coded hex here rather than
 * CSS vars because react-force-graph-2d renders to canvas, which cannot
 * inherit CSS variables. Values are picked to echo the site's dark UI palette.
 */
export const NODE_STYLE: Record<NodeKind, NodeStyle> = {
  root: {
    fill: "#0f172a",
    stroke: "#f8fafc",
    baseRadius: 14,
    labelColor: "#f8fafc",
  },
  brand: {
    fill: "#0f766e",
    stroke: "#99f6e4",
    baseRadius: 10,
    labelColor: "#ccfbf1",
  },
  category: {
    fill: "#9a3412",
    stroke: "#fdba74",
    baseRadius: 7,
    labelColor: "#fed7aa",
  },
  product: {
    fill: "#1e3a8a",
    stroke: "#bfdbfe",
    baseRadius: 4,
    labelColor: "#e0e7ff",
  },
}

/**
 * Scale node radius slightly by its associated product count so heavy brands
 * / categories visually out-weigh long-tail ones.
 */
export function nodeRadius(kind: NodeKind, productCount?: number): number {
  const base = NODE_STYLE[kind].baseRadius
  if (!productCount || productCount <= 0 || kind === "product" || kind === "root") {
    return base
  }
  return base + Math.min(8, Math.log2(productCount + 1))
}

export const LINK_COLOR = "rgba(148, 163, 184, 0.25)"
export const LINK_COLOR_HIGHLIGHT = "rgba(191, 219, 254, 0.8)"
