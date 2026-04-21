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

/** H in degrees 0–360; s,l in 0–1. Used when CSS is hsl() so we can measure RGB chroma. */
const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  const hd = ((h % 360) + 360) % 360
  const hn = hd / 360
  let r: number
  let g: number
  let b: number
  if (s < 1e-6) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tt = t
      if (tt < 0) {
        tt += 1
      }
      if (tt > 1) {
        tt -= 1
      }
      if (tt < 1 / 6) {
        return p + (q - p) * 6 * tt
      }
      if (tt < 1 / 2) {
        return q
      }
      if (tt < 2 / 3) {
        return p + (q - p) * (2 / 3 - tt) * 6
      }
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, hn + 1 / 3)
    g = hue2rgb(p, q, hn)
    b = hue2rgb(p, q, hn - 1 / 3)
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

const rgbFromResolvedCss = (
  css: string,
  hsl: { h: number; s: number; l: number }
): { r: number; g: number; b: number } => {
  const fromHex = hexToRgb(css.trim())
  if (fromHex) {
    return fromHex
  }
  return hslToRgb(hsl.h, hsl.s, hsl.l)
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

/** RGB chroma (0–255). Low values are greys/slates even when HSL “saturation” reads high. */
const rgbChroma = (r: number, g: number, b: number) => {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

/**
 * Greys and charcoals often pick up a blue tint; HSL s can exceed 0.11 while still being neutral.
 * Chroma catches those so they sort in the grey ramp, not scattered through the rainbow.
 */
const CHROMA_NEUTRAL_MAX = 36

const sortKeyForLabel = (
  label: string,
  hsl: { h: number; s: number; l: number },
  rgb: { r: number; g: number; b: number }
): number[] => {
  let { h, s, l } = hsl
  if (Number.isNaN(h)) {
    h = 0
  }

  const lex = labelLexemes(label)
  const lexWords = Array.from(lex)
  const isWhiteName = lexWords.some((w) => WHITE_LABEL_LEXEMES.has(w))
  const isBlackName = lexWords.some((w) => BLACK_LABEL_LEXEMES.has(w))

  const chroma = rgbChroma(rgb.r, rgb.g, rgb.b)
  const neutralByChroma = chroma <= CHROMA_NEUTRAL_MAX
  const achromatic = s < 0.14 || neutralByChroma

  if (isBlackName || (l < 0.12 && achromatic && neutralByChroma)) {
    return [4, 0, 0, l]
  }

  if (isWhiteName || (l >= 0.95 && s < 0.09 && neutralByChroma)) {
    return [0, 0, -l, h]
  }

  // Do not pull “pastel blue / lilac / ice” into an early band — they must sort by hue with the rest
  // of the spectrum (see previous bug: light blues appeared before pure reds).

  // All non‑white greys (light → dark) after the rainbow, never mixed into row 1 after white
  if (neutralByChroma && l >= 0.12 && l <= 0.94) {
    return [3, l, h, 0]
  }

  // Chromatic: hue order (0° red → 360°)
  return [2, h, -l, s]
}

export const sortGarmentColorLabels = (labels: string[]): string[] => {
  const scored = labels.map((label) => {
    const css = resolveGarmentSwatchColor(label)
    const hsl = parseCssColorToHsl(css)
    if (!hsl) {
      return { label, key: [99, 0, 0, 0] as number[] }
    }
    const rgb = rgbFromResolvedCss(css, hsl)
    return { label, key: sortKeyForLabel(label, hsl, rgb) }
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
