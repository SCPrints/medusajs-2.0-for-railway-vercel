/**
 * Ink colours for the DSP pack, read off the artwork: which colours each
 * screen prints, their nearest Pantone (PMS) from the studio's library, and a
 * warning when the artwork has more inks than the order. Pure — the artwork
 * pixels are decoded by services/dsp-pack/pdf.ts. Kept apart from
 * lib/dsp-job.ts so the admin bundle doesn't carry the Pantone library.
 */
import type { DspPage } from "./dsp-job"
import { PANTONE_C } from "./pantone-library"

export type InkCluster = { hex: string; share: number }

const hexRgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase()

/** sRGB → CIE Lab (D65). */
export function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92
  })
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const deltaE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

let library: Array<{ name: string; lab: number[] }> | null = null
/** Nearest Pantone C to a colour (ΔE76) — a starting point for DSP, not a guarantee. */
export function nearestPantone(hex: string): string {
  library ??= PANTONE_C.map((p) => ({ name: p.name, lab: hexToLab(p.hex) }))
  const lab = hexToLab(hex)
  let best = library[0]
  for (const p of library) if (deltaE(p.lab, lab) < deltaE(best.lab, lab)) best = p
  return best.name
}

/**
 * One PMS per ink across a job: the first time a colour is matched it picks
 * the nearest Pantone; a later colour within ΔE 12 of it (the same logo green
 * read off a PNG instead of the SVG) reuses that PMS. Feed vector artwork first.
 */
export function sharedPantone(): (hex: string) => string {
  const seen: Array<{ lab: number[]; name: string }> = []
  return (hex) => {
    const lab = hexToLab(hex)
    const hit = seen.find((s) => deltaE(s.lab, lab) < 12)
    if (hit) return hit.name
    const name = nearestPantone(hex)
    seen.push({ lab, name })
    return name
  }
}

/** Plain colour words staff write in quote notes, and what they look like. */
const BASIC: Record<string, string> = {
  white: "#FFFFFF",
  black: "#000000",
  grey: "#808080",
  gray: "#808080",
  silver: "#C0C0C0",
  red: "#D32F2F",
  maroon: "#7B1E2B",
  orange: "#F57C00",
  yellow: "#FBC02D",
  gold: "#C9A227",
  green: "#2E9E4F",
  teal: "#00897B",
  blue: "#1E63C6",
  navy: "#1F2A5A",
  purple: "#6A1B9A",
  pink: "#F48FB1",
  brown: "#6D4C41",
}
const basicName = (hex: string) => {
  const lab = hexToLab(hex)
  return Object.keys(BASIC).reduce((a, b) => (deltaE(hexToLab(BASIC[a]), lab) <= deltaE(hexToLab(BASIC[b]), lab) ? a : b))
}
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const PLACEHOLDER = /^Colour \d+ - see artwork$/

/**
 * Distinct ink colours in decoded RGBA artwork pixels, biggest first.
 * Semi-transparent edge pixels are skipped, near-identical shades merge,
 * anti-aliased blends between two real colours are dropped, and a colour must
 * cover ≥0.5% of the inked area. No real transparency → the biggest colour is
 * the paper background and is dropped.
 * ponytail: bucket + greedy-merge heuristic; photos/gradients just read as "many",
 * and a real ink sitting between two others (grey between black and white) is
 * taken for a blend and missed — it under-warns, never over-warns.
 */
export function inkClusters(rgba: Uint8Array, minShare = 0.005): InkCluster[] {
  const buckets = new Map<number, [number, number, number, number]>() // count + channel sums
  let inked = 0
  let clear = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 200) {
      clear++
      continue
    }
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4)
    const bk = buckets.get(key) ?? [0, 0, 0, 0]
    bk[0]++
    bk[1] += rgba[i]
    bk[2] += rgba[i + 1]
    bk[3] += rgba[i + 2]
    buckets.set(key, bk)
    inked++
  }
  if (!inked) return []
  // r/g/b = the cluster's first (biggest) bucket's average colour — its true ink colour.
  type C = { r: number; g: number; b: number; n: number }
  const clusters: C[] = []
  for (const [n, sr, sg, sb] of [...buckets.values()].sort((a, b) => b[0] - a[0])) {
    const [r, g, b] = [sr / n, sg / n, sb / n]
    const near = clusters.find((c) => (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2 < 64 ** 2)
    if (near) near.n += n
    else clusters.push({ r, g, b, n })
  }
  clusters.sort((a, b) => b.n - a.n)
  // Edge pixels blend two real colours (white text on a black background reads
  // grey): a cluster sitting on the line between two bigger ones is a blend.
  const offLine = (c: C, a: C, b: C) => {
    const [dx, dy, dz] = [b.r - a.r, b.g - a.g, b.b - a.b]
    const len = dx * dx + dy * dy + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((c.r - a.r) * dx + (c.g - a.g) * dy + (c.b - a.b) * dz) / len))
    return Math.hypot(c.r - a.r - t * dx, c.g - a.g - t * dy, c.b - a.b - t * dz)
  }
  const real: C[] = []
  for (const c of clusters) if (!real.some((a, i) => real.slice(i + 1).some((b) => offLine(c, a, b) < 40))) real.push(c)
  const inks = clear < (inked + clear) * 0.1 ? real.slice(1) : real // no transparency → biggest cluster is the background
  const area = inks.reduce((s, c) => s + c.n, 0)
  return inks.filter((c) => c.n >= area * minShare).map((c) => ({ hex: toHex(c.r, c.g, c.b), share: c.n / area }))
}

/**
 * Rewrites a screen page's ink names from its artwork: each ink the order
 * counts gets a name (staff's from the quote note, else read off the artwork)
 * and, unless it's white or black, the nearest PMS. Returns a warning when the
 * artwork has more inks than the order says.
 */
export function applyArtworkInks(page: DspPage, clusters: InkCluster[], pms: (hex: string) => string = nearestPantone): string | null {
  if (page.method !== "screen" || !clusters.length) return null
  const names = page.inks.slice(page.dark ? 1 : 0)
  const unused = [...clusters]
  const take = (target: string | null) => {
    if (!unused.length) return null
    const i = target ? unused.reduce((best, c, k) => (deltaE(hexToLab(c.hex), hexToLab(target)) < deltaE(hexToLab(unused[best].hex), hexToLab(target)) ? k : best), 0) : 0
    return unused.splice(i, 1)[0]
  }
  // Named inks first ("Green" → the greenest colour in the artwork), then the rest biggest-first.
  const wordHex = (name: string) => Object.keys(BASIC).find((w) => new RegExp(`\\b${w}\\b`, "i").test(name))
  const paired = new Map<number, InkCluster | null>()
  names.forEach((n, k) => {
    const w = PLACEHOLDER.test(n) ? undefined : wordHex(n)
    if (w) paired.set(k, take(BASIC[w]))
  })
  names.forEach((_, k) => {
    if (!paired.has(k)) paired.set(k, take(null))
  })
  let matched = false
  const inks = names.map((n, k) => {
    const c = paired.get(k)
    if (!c) return n
    const name = PLACEHOLDER.test(n) ? titleCase(basicName(c.hex)) : n
    if (/^(white|black)$/i.test(basicName(c.hex))) return name
    matched = true
    return `${name} ${pms(c.hex)}`
  })
  page.inks = [...(page.dark ? ["Base"] : []), ...inks]
  page.colourLines = page.inks.map((ink, k) => `${k + 1}/${page.inks.length} ${ink.toUpperCase()}`)
  page.pmsFromArtwork = matched
  return clusters.length > names.length
    ? `${page.positionLabel}: the artwork looks like ${clusters.length} ink colours but the order says ${names.length} — fix the colour count on the order before sending.`
    : null
}
