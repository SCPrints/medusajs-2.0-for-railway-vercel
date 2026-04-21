import { toTitleSlug } from "@modules/products/lib/variant-options"

/** Hex values for known garment colour labels — used for swatches and perceptual sorting. */
export const GARMENT_COLOR_SWATCHES: Record<string, string> = {
  black: "#111827",
  white: "#f9fafb",
  navy: "#1e3a8a",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#15803d",
  yellow: "#facc15",
  orange: "#f97316",
  purple: "#7c3aed",
  pink: "#ec4899",
  grey: "#6b7280",
  gray: "#6b7280",
  charcoal: "#374151",
  cream: "#fef3c7",
  maroon: "#7f1d1d",
  ecru: "#ede3cf",
  stone: "#d6d3d1",
  natural: "#f5f5dc",
  brown: "#7c5a3b",
  khaki: "#8a7f52",
  walnut: "#6b4f3a",
  mushroom: "#a1907f",
  forest: "#2f5d50",
  olive: "#556b2f",
  sage: "#9caf88",
  sand: "#d8c8a8",
  beige: "#d6c2a4",
  tan: "#b58d66",
  camel: "#b08457",
  copper: "#b87333",
  gold: "#c9a227",
  silver: "#c0c0c0",
  chocolate: "#5c4033",
  coffee: "#6f4e37",
  burgundy: "#800020",
  wine: "#722f37",
  rust: "#b7410e",
  charcoalmarl: "#5b6268",
  marle: "#a8a9ad",
  heather: "#9ea3a8",
  asphalt: "#4b5563",
  smoke: "#7b8794",
  shadow: "#6b7280",
  storm: "#7a838f",
  lilac: "#c8a2c8",
  lavender: "#b7a3d0",
  orchid: "#b565d9",
  mint: "#98d8c8",
  teal: "#0f766e",
  sky: "#7ec8e3",
  royal: "#4169e1",
  cobalt: "#0047ab",
  indigo: "#3f51b5",
  denim: "#4f6d8a",
  butter: "#f4e08d",
  bone: "#e8dfd0",
  walnutbrown: "#6b4f3a",
  arctic: "#c5d9e8",
  arcticblue: "#c5d9e8",
  plum: "#7c3d5a",
  rose: "#f4c2c2",
  coral: "#ff7f7f",
  blush: "#fde2e4",
  glacier: "#e8eef2",
  ink: "#1a1a2e",
  midnight: "#191970",
  paper: "#f5f2eb",
  oatmeal: "#e8dfd0",
  fog: "#d4d4d8",
  slate: "#64748b",
  pebble: "#a8a29e",
}

const hashToHsl = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 40% 62%)`
}

/** Resolved CSS colour for a garment label (hex or hsl) — same logic as PDP swatch fill. */
export const resolveGarmentSwatchColor = (colorValue: string): string => {
  const normalized = toTitleSlug(colorValue)
  if (!normalized) {
    return "#d1d5db"
  }

  const compact = normalized.replace(/\s+/g, "")
  const tokens = normalized.split(" ")

  const matched =
    GARMENT_COLOR_SWATCHES[normalized] ??
    GARMENT_COLOR_SWATCHES[compact] ??
    tokens.map((token) => GARMENT_COLOR_SWATCHES[token]).find(Boolean)

  return matched ?? hashToHsl(normalized)
}
