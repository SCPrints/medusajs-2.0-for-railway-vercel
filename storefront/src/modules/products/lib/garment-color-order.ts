import { resolveGarmentSwatchColor } from "@modules/products/lib/garment-swatch-colors"
import { toTitleSlug } from "@modules/products/lib/variant-options"

const CLEAN_TOKEN_RE = /[^a-z0-9]+/g

/** Near-white labels — pinned to the start before creams/off-whites. */
const WHITE_LABEL_LEXEMES = new Set(["white", "brightwhite", "purewhite", "opticwhite", "snow"])

/** Near-black labels — pinned to the very end after charcoal greys. */
const BLACK_LABEL_LEXEMES = new Set([
  "black",
  "jet",
  "onyx",
  "ebony",
])

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

const labelLexemes = (label: string): Set<string> => {
  const slug = toTitleSlug(label).replace(CLEAN_TOKEN_RE, " ").trim()
  const compact = slug.replace(/\s+/g, "")
  const parts = slug.split(" ").filter(Boolean)
  return new Set([compact, ...parts])
}

/**
 * Build a sort key: whites/creams → rainbow (hue) → cool greys → black.
 * Uses the same resolved CSS as swatches so order matches what you see.
 */
const sortKeyForLabel = (label: string, hsl: { h: number; s: number; l: number }): number[] => {
  let { h, s, l } = hsl
  if (Number.isNaN(h)) {
    h = 0
  }

  const lex = labelLexemes(label)
  const lexWords = Array.from(lex)
  const isWhiteName = lexWords.some((w) => WHITE_LABEL_LEXEMES.has(w))
  const isBlackName = lexWords.some((w) => BLACK_LABEL_LEXEMES.has(w))

  const achromatic = s < 0.11

  if (isBlackName || (l < 0.12 && achromatic)) {
    return [4, 0, 0, l]
  }

  if (isWhiteName || (l > 0.96 && s < 0.07)) {
    return [0, 0, -l, h]
  }

  // Cream / ivory / warm off‑white (high lightness, modest chroma)
  if (l > 0.85 && s >= 0.04 && s < 0.22 && !achromatic) {
    return [0, 1, h, -l]
  }

  if (l > 0.92 && achromatic) {
    return [0, 2, -l, h]
  }

  // Grey and silver ramp (cool neutrals, not black/white)
  if (achromatic && l >= 0.13 && l <= 0.94) {
    return [3, l, h, 0]
  }

  // Chromatic: classic hue order (0° red → 360°)
  return [2, h, -l, s]
}

export const sortGarmentColorLabels = (labels: string[]): string[] => {
  const scored = labels.map((label) => {
    const css = resolveGarmentSwatchColor(label)
    const hsl = parseCssColorToHsl(css)
    if (!hsl) {
      return { label, key: [99, 0, 0, 0] as number[] }
    }
    return { label, key: sortKeyForLabel(label, hsl) }
  })

  const cmpArr = (a: number[], b: number[]) => {
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) {
      const da = a[i] ?? 0
      const db = b[i] ?? 0
      if (da !== db) {
        return da - db
      }
    }
    return 0
  }

  scored.sort((a, b) => {
    const d = cmpArr(a.key, b.key)
    if (d !== 0) {
      return d
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  })

  return scored.map((s) => s.label)
}
