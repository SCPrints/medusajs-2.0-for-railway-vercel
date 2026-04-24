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
 * inherit CSS variables.
 *
 * Palette tuned for AA-ish contrast against both the site's dark chrome and
 * the lighter content backgrounds used on /brands. Fills are bright enough to
 * pop on either background; strokes and labels are high-contrast white/pale
 * tints so labels stay legible at small zoom levels.
 */
export const NODE_STYLE: Record<NodeKind, NodeStyle> = {
  root: {
    fill: "#f8fafc",
    stroke: "#0f172a",
    baseRadius: 14,
    labelColor: "#0f172a",
  },
  brand: {
    fill: "#14b8a6",
    stroke: "#ffffff",
    baseRadius: 11,
    labelColor: "#f1f5f9",
  },
  category: {
    fill: "#f97316",
    stroke: "#ffffff",
    baseRadius: 8,
    labelColor: "#f1f5f9",
  },
  product: {
    fill: "#60a5fa",
    stroke: "#ffffff",
    baseRadius: 5,
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

export const LINK_COLOR = "rgba(148, 163, 184, 0.45)"
export const LINK_COLOR_HIGHLIGHT = "rgba(191, 219, 254, 0.9)"
