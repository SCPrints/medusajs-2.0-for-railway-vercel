import { toTitleSlug } from "@modules/products/lib/variant-options"

/** Hex values for known garment colour labels — used for swatches and perceptual sorting. */
export const GARMENT_COLOR_SWATCHES: Record<string, string> = {
  arctic: "#c5d9e8",
  arcticblue: "#c5d9e8",
  asphalt: "#4b5563",
  beige: "#d6c2a4",
  berry: "#8b1538",
  black: "#111827",
  blue: "#2563eb",
  bone: "#e8dfd0",
  blush: "#fde2e4",
  brown: "#7c5a3b",
  burgundy: "#800020",
  butter: "#f4e08d",
  camel: "#b08457",
  cardinal: "#c41e3a",
  charcoal: "#374151",
  charcoalmarl: "#5b6268",
  chocolate: "#5c4033",
  cobalt: "#0047ab",
  coffee: "#6f4e37",
  copper: "#b87333",
  coral: "#ff7f7f",
  cream: "#fef3c7",
  cyan: "#06b6d4",
  darkgray: "#4b5563",
  darkgreen: "#14532d",
  darkgrey: "#4b5563",
  darknavy: "#0f203b",
  darkteal: "#004b49",
  denim: "#4f6d8a",
  dustyrose: "#d4a59a",
  ecru: "#ede3cf",
  fog: "#d4d4d8",
  forest: "#2f5d50",
  forestgreen: "#1b4d3e",
  glacier: "#e8eef2",
  gold: "#c9a227",
  gray: "#6b7280",
  green: "#15803d",
  grey: "#6b7280",
  heather: "#9ea3a8",
  indigo: "#3f51b5",
  ink: "#1a1a2e",
  khaki: "#8a7f52",
  lavender: "#b7a3d0",
  lemon: "#fff44f",
  lightgray: "#d1d5db",
  lightgrey: "#d1d5db",
  lilac: "#c8a2c8",
  lime: "#bfff00",
  marle: "#a8a9ad",
  maroon: "#7f1d1d",
  mauve: "#b784a7",
  mediumgray: "#6b7280",
  mediumgrey: "#6b7280",
  midnight: "#191970",
  mint: "#98d8c8",
  mushroom: "#a1907f",
  mustard: "#ffdb58",
  natural: "#f5f5dc",
  navy: "#1e3a8a",
  offwhite: "#f5f5f0",
  "off white": "#f5f5f0",
  oatmeal: "#e8dfd0",
  olive: "#556b2f",
  orange: "#f97316",
  orchid: "#b565d9",
  paleyellow: "#faf8d4",
  paper: "#f5f2eb",
  pebble: "#a8a29e",
  pink: "#ec4899",
  pine: "#01796f",
  pinegreen: "#01796f",
  pistachio: "#93c572",
  plum: "#7c3d5a",
  purple: "#7c3aed",
  red: "#dc2626",
  rose: "#f4c2c2",
  royal: "#4169e1",
  royalblue: "#2b4acb",
  rust: "#b7410e",
  sage: "#9caf88",
  sand: "#d8c8a8",
  seafoam: "#9fe2bf",
  shadow: "#6b7280",
  silver: "#c0c0c0",
  sky: "#7ec8e3",
  skyblue: "#67c3eb",
  slate: "#64748b",
  smoke: "#7b8794",
  steel: "#71797e",
  stone: "#d6d3d1",
  storm: "#7a838f",
  tan: "#b58d66",
  teal: "#0f766e",
  walnut: "#6b4f3a",
  walnutbrown: "#6b4f3a",
  white: "#f9fafb",
  wine: "#722f37",
  yellow: "#facc15",
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
