import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"

const NEUTRAL_S_MAX = 0.14
const CLEAN_TOKEN_RE = /[^a-z0-9]+/g

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!m) {
    return null
  }
  let h = m[1]
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("")
  }
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  const d = max - min
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      default:
        h = ((r - g) / d + 4) / 6
    }
  }
  return { h: h * 360, s, l }
}

const parseCssColorToHsl = (css: string): { h: number; s: number; l: number } | null => {
  const trimmed = css.trim()
  const rgbFromHex = hexToRgb(trimmed)
  if (rgbFromHex) {
    return rgbToHsl(rgbFromHex.r, rgbFromHex.g, rgbFromHex.b)
  }

  const hslModern = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/i.exec(trimmed)
  if (hslModern) {
    return {
      h: Number(hslModern[1]),
      s: Number(hslModern[2]) / 100,
      l: Number(hslModern[3]) / 100,
    }
  }

  const hslLegacy = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i.exec(trimmed)
  if (hslLegacy) {
    return {
      h: Number(hslLegacy[1]),
      s: Number(hslLegacy[2]) / 100,
      l: Number(hslLegacy[3]) / 100,
    }
  }

  return null
}

const FAMILY_KEYWORDS: Array<{ rank: number; words: string[] }> = [
  { rank: 0, words: ["black", "charcoal", "charcoalmarl", "ink", "asphalt", "midnight"] },
  { rank: 1, words: ["white", "cream", "natural", "paper", "bone", "oatmeal", "ecru", "beige", "sand", "stone", "pebble", "fog", "silver", "grey", "gray", "heather", "marle", "smoke", "shadow", "storm", "slate"] },
  { rank: 2, words: ["brown", "chocolate", "coffee", "tan", "camel", "khaki", "walnut", "walnutbrown", "mushroom", "copper", "rust"] },
  { rank: 3, words: ["red", "maroon", "burgundy", "wine", "crimson"] },
  { rank: 4, words: ["pink", "rose", "blush", "coral"] },
  { rank: 5, words: ["orange", "amber", "apricot", "peach"] },
  { rank: 6, words: ["yellow", "gold", "butter", "mustard"] },
  { rank: 7, words: ["green", "forest", "olive", "sage", "lime"] },
  { rank: 8, words: ["teal", "mint", "aqua", "turquoise", "cyan"] },
  { rank: 9, words: ["blue", "navy", "royal", "cobalt", "denim", "sky", "arctic", "arcticblue"] },
  { rank: 10, words: ["purple", "plum", "lilac", "lavender", "orchid", "violet"] },
]

const familyRankFromLabel = (label: string): number => {
  const normalized = label.toLowerCase().replace(CLEAN_TOKEN_RE, " ").trim()
  const compact = normalized.replace(/\s+/g, "")
  const tokens = normalized.split(" ").filter(Boolean)

  for (const family of FAMILY_KEYWORDS) {
    if (
      family.words.includes(compact) ||
      tokens.some((token) => family.words.includes(token)) ||
      family.words.some((w) => compact.includes(w))
    ) {
      return family.rank
    }
  }

  return 99
}

/**
 * Sort labels into human-friendly colour families first, then by light/dark and hue.
 */
export const sortGarmentColorLabels = (labels: string[]): string[] => {
  const scored = labels.map((label) => {
    const css = resolveGarmentSwatchColor(label)
    const hsl = parseCssColorToHsl(css)
    if (!hsl) {
      return { label, key: [familyRankFromLabel(label), 999, 999, 999] as [number, number, number, number] }
    }
    const { h, s, l } = hsl
    const familyRank = familyRankFromLabel(label)
    const neutral = s < NEUTRAL_S_MAX
    if (neutral && familyRank >= 99) {
      return { label, key: [1, l, h, s] as [number, number, number, number] }
    }
    if (familyRank < 99) {
      return { label, key: [familyRank, l, h, s] as [number, number, number, number] }
    }
    return { label, key: [50, h, s, l] as [number, number, number, number] }
  })

  const cmp = (a: [number, number, number, number], b: [number, number, number, number]) => {
    for (let i = 0; i < 4; i++) {
      if (a[i] !== b[i]) {
        return a[i] - b[i]
      }
    }
    return 0
  }

  scored.sort((a, b) => {
    const d = cmp(a.key, b.key)
    if (d !== 0) {
      return d
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  })

  return scored.map((s) => s.label)
}
