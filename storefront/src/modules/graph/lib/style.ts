import type { NodeKind } from "../../../types/graph"

/**
 * Space palette — same tokens as the home space hero (`space-hero/starfield.ts`)
 * so the catalog map and the hero read as one world. Hard-coded hex because
 * react-force-graph-2d paints to canvas, which cannot read CSS variables.
 */
export const SPACE = {
  bg: "#0B0C10",
  dim: "#1F2833",
  mid: "#5C6370",
  bright: "#C5C6C7",
  teal: "#45A29E",
  cyan: "#66FCF1",
  gold: "#FFE680",
  white: "#FFFFFF",
} as const

export type NodeStyle = {
  /** Resting fill. */
  fill: string
  /** Fill when hovered, selected, or adjacent to the focus. */
  highlightFill: string
  stroke: string
  baseRadius: number
  labelColor: string
  labelHighlightColor: string
}

/**
 * Sun (root) · planets (brands) · moons (categories) · beacons (types) ·
 * background stars (tags) · dust (products).
 */
export const NODE_STYLE: Record<NodeKind, NodeStyle> = {
  root: {
    fill: SPACE.gold,
    highlightFill: "#FFF3B0",
    stroke: SPACE.gold,
    baseRadius: 16,
    labelColor: SPACE.gold,
    labelHighlightColor: SPACE.white,
  },
  brand: {
    fill: "#E6E7E8",
    highlightFill: SPACE.white,
    stroke: SPACE.teal,
    baseRadius: 10,
    labelColor: SPACE.bright,
    labelHighlightColor: SPACE.white,
  },
  category: {
    fill: "#2A3548",
    highlightFill: "#E8E9EA",
    stroke: SPACE.bright,
    baseRadius: 6,
    labelColor: SPACE.bright,
    labelHighlightColor: SPACE.white,
  },
  type: {
    fill: SPACE.dim,
    highlightFill: SPACE.cyan,
    stroke: SPACE.cyan,
    baseRadius: 5,
    labelColor: SPACE.cyan,
    labelHighlightColor: SPACE.white,
  },
  tag: {
    fill: "#9098A6",
    highlightFill: SPACE.gold,
    stroke: "#9098A6",
    baseRadius: 1.5,
    labelColor: "#9098A6",
    labelHighlightColor: SPACE.gold,
  },
  product: {
    fill: "#9098A6",
    highlightFill: SPACE.cyan,
    stroke: SPACE.bright,
    baseRadius: 2.5,
    labelColor: SPACE.bright,
    labelHighlightColor: SPACE.white,
  },
}

/** Planets and moons grow with their product count so the big ranges read as big worlds. */
export function nodeRadius(kind: NodeKind, productCount?: number): number {
  const base = NODE_STYLE[kind].baseRadius
  if (!productCount || productCount <= 0 || kind === "product" || kind === "root" || kind === "tag") {
    return base
  }
  return base + Math.min(8, Math.log2(productCount + 1))
}

/**
 * Orbit radius per node kind (graph units). Brands sit on the inner orbit,
 * the audience categories on the next, types and tags further out. Products
 * and sub-categories are NOT ringed — they hang off their hub via link distance.
 */
export const RING_RADIUS: Partial<Record<NodeKind, number>> = {
  brand: 170,
  category: 270,
  type: 360,
  tag: 430,
}

/** Resting link colour: faint teal so spokes recede behind the orbit rings. */
export const LINK_COLOR = "rgba(69, 162, 158, 0.16)"
/** Links inside the active neighbourhood. */
export const LINK_COLOR_HIGHLIGHT = "rgba(102, 252, 241, 0.85)"
/** Links outside the active neighbourhood. */
export const LINK_COLOR_DIMMED = "rgba(69, 162, 158, 0.04)"
/** Orbit ring stroke. */
export const RING_COLOR = "rgba(197, 198, 199, 0.08)"

/**
 * One "cockpit" surface for every HUD card. Uses `!text-*` so globals.css's
 * link/chip repaints (navy text, magenta pills) can't bleed onto the dark panel.
 */
export const HUD_SURFACE =
  "rounded-xl border border-[#45A29E]/30 bg-[#0B0C10]/75 !text-[#C5C6C7] shadow-[0_0_24px_rgba(69,162,158,0.12)] backdrop-blur"
export const HUD_LABEL = "text-[0.65rem] uppercase tracking-widest !text-[#45A29E]"
export const HUD_BUTTON =
  "min-h-11 rounded-md border border-[#45A29E]/40 bg-[#1F2833]/80 px-3 text-left text-small-regular !text-[#C5C6C7] hover:bg-[#1F2833] hover:!text-white disabled:opacity-60"
