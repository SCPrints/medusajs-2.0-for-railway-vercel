/**
 * Deterministic spot-colour estimation for screen printing. Runs entirely
 * client-side on the composed side artwork — no API cost, instant.
 *
 * Core functions operate on raw ImageData-shaped objects so they're unit
 * testable without a canvas; the `*FromDataUrl` wrappers are browser-only.
 *
 * The estimate is advisory: it seeds the colour-count dropdown and powers the
 * add-to-cart mismatch check. Ambiguous artwork (gradients/photos) reports
 * `printable: false` — the UI steers those to DTF or the AI estimator
 * (/api/screen/estimate-colours).
 */

import { SCREEN_MAX_COLOURS } from "./scp-screen-print-pricing"

export type ImageDataLike = {
  width: number
  height: number
  /** RGBA byte array, 4 bytes per pixel. */
  data: Uint8ClampedArray | number[]
}

export type ScreenColourEstimate = {
  /** Spot colours estimated, clamped 1..SCREEN_MAX_COLOURS. */
  colours: number
  /** Cluster count before the cap — >SCREEN_MAX_COLOURS means "too many". */
  rawClusters: number
  /** False when the artwork looks gradient/photographic or needs >6 colours. */
  printable: boolean
  /** Dominant cluster colours as #rrggbb, descending coverage. */
  palette: string[]
}

const ALPHA_THRESHOLD = 128
/** Clusters covering less than this share of opaque pixels are noise (anti-aliasing). */
const MIN_COVERAGE = 0.02
/** Euclidean RGB distance within which two shades merge into one ink. */
const MERGE_DISTANCE = 64
/** More distinct pre-merge buckets than this → gradient/photo, not spot colour. */
const PHOTO_BUCKET_LIMIT = 400
/** Surviving clusters must cover at least this share of pixels or the art is too noisy. */
const MIN_TOTAL_COVERAGE = 0.8

type Cluster = { r: number; g: number; b: number; count: number }

const toHex = (c: Cluster): string =>
  `#${[c.r, c.g, c.b]
    .map((v) => Math.round(v).toString(16).padStart(2, "0"))
    .join("")}`

export function estimateScreenColoursFromImageData(
  img: ImageDataLike
): ScreenColourEstimate {
  const data = img.data
  // Bucket to 16 levels per channel (>>4) to collapse compression noise.
  const buckets = new Map<number, Cluster>()
  let opaque = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]
    if (a < ALPHA_THRESHOLD) continue
    opaque++
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const existing = buckets.get(key)
    if (existing) {
      existing.count++
      // Running average keeps the centroid honest within the bucket.
      existing.r += (r - existing.r) / existing.count
      existing.g += (g - existing.g) / existing.count
      existing.b += (b - existing.b) / existing.count
    } else {
      buckets.set(key, { r, g, b, count: 1 })
    }
  }

  if (opaque === 0) {
    return { colours: 1, rawClusters: 0, printable: true, palette: [] }
  }

  const photoLike = buckets.size > PHOTO_BUCKET_LIMIT

  // Greedy merge: largest buckets first; absorb anything within MERGE_DISTANCE.
  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count)
  const clusters: Cluster[] = []
  for (const bucket of sorted) {
    let merged = false
    for (const cluster of clusters) {
      const dr = cluster.r - bucket.r
      const dg = cluster.g - bucket.g
      const db = cluster.b - bucket.b
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= MERGE_DISTANCE) {
        const total = cluster.count + bucket.count
        cluster.r = (cluster.r * cluster.count + bucket.r * bucket.count) / total
        cluster.g = (cluster.g * cluster.count + bucket.g * bucket.count) / total
        cluster.b = (cluster.b * cluster.count + bucket.b * bucket.count) / total
        cluster.count = total
        merged = true
        break
      }
    }
    if (!merged) clusters.push(bucket)
  }

  const significant = clusters.filter((c) => c.count / opaque >= MIN_COVERAGE)
  const coverage =
    significant.reduce((sum, c) => sum + c.count, 0) / opaque
  const rawClusters = significant.length
  const printable =
    !photoLike && rawClusters >= 1 && rawClusters <= SCREEN_MAX_COLOURS && coverage >= MIN_TOTAL_COVERAGE

  return {
    colours: Math.max(1, Math.min(SCREEN_MAX_COLOURS, rawClusters)),
    rawClusters,
    printable,
    palette: significant
      .sort((a, b) => b.count - a.count)
      .slice(0, SCREEN_MAX_COLOURS)
      .map(toHex),
  }
}

/**
 * Recolour the artwork to its top-N cluster palette — the "what screen
 * printing in N colours actually looks like" preview. Transparent pixels
 * stay transparent; every opaque pixel snaps to the nearest of the N inks.
 */
export function quantiseImageDataToColours(
  img: ImageDataLike,
  colourCount: number
): { data: Uint8ClampedArray; palette: string[] } {
  const n = Math.max(1, Math.min(SCREEN_MAX_COLOURS, Math.round(colourCount)))
  const estimate = estimateScreenColoursFromImageData(img)
  const palette = estimate.palette.slice(0, n).map((hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }))
  const out = new Uint8ClampedArray(img.data.length)
  const data = img.data
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]
    if (a < ALPHA_THRESHOLD || palette.length === 0) {
      out[i + 3] = 0
      continue
    }
    let best = palette[0]
    let bestDist = Infinity
    for (const p of palette) {
      const dr = p.r - data[i]
      const dg = p.g - data[i + 1]
      const db = p.b - data[i + 2]
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) {
        bestDist = dist
        best = p
      }
    }
    out[i] = best.r
    out[i + 1] = best.g
    out[i + 2] = best.b
    out[i + 3] = 255
  }
  return {
    data: out,
    palette: palette.map((p) =>
      `#${[p.r, p.g, p.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`
    ),
  }
}

/** Max dimension the browser wrappers downscale to before analysis. */
const ANALYSIS_SIZE = 160

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load artwork for colour analysis."))
    img.src = dataUrl
  })

const drawToImageData = (
  img: HTMLImageElement,
  maxDim: number
): ImageData | null => {
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
  const w = Math.max(1, Math.round((img.width || 1) * scale))
  const h = Math.max(1, Math.round((img.height || 1) * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** Browser-only: estimate spot colours from a data-URL of the side artwork. */
export async function estimateScreenColoursFromDataUrl(
  dataUrl: string
): Promise<ScreenColourEstimate | null> {
  try {
    const img = await loadImage(dataUrl)
    const imageData = drawToImageData(img, ANALYSIS_SIZE)
    if (!imageData) return null
    return estimateScreenColoursFromImageData(imageData)
  } catch {
    return null
  }
}

/** Browser-only: render the N-colour screen-print preview as a PNG data URL. */
export async function quantisePreviewFromDataUrl(
  dataUrl: string,
  colourCount: number,
  maxDim = 600
): Promise<{ previewUrl: string; palette: string[] } | null> {
  try {
    const img = await loadImage(dataUrl)
    const imageData = drawToImageData(img, maxDim)
    if (!imageData) return null
    const { data, palette } = quantiseImageDataToColours(imageData, colourCount)
    const canvas = document.createElement("canvas")
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), imageData.width, imageData.height), 0, 0)
    return { previewUrl: canvas.toDataURL("image/png"), palette }
  } catch {
    return null
  }
}

/**
 * Dark-garment heuristic from the selected colour's name — dark garments
 * need a white underbase screen. Advisory default; the customer can untick.
 */
const DARK_COLOUR_RE =
  /\b(black|navy|charcoal|graphite|coal|ink|midnight|dark|forest|bottle|emerald|kelly|army|olive|khaki green|maroon|burgundy|wine|plum|purple|royal|cobalt|denim|indigo|brown|chocolate|espresso|red|green|blue|teal|petrol|slate|steel|gunmetal|storm|granite)\b/i
const LIGHT_COLOUR_RE =
  /\b(white|natural|cream|ecru|ivory|bone|sand|beige|stone|ash|silver|grey marle|gray marle|light|pale|pastel|lemon|pink|sky|mint|lilac|peach|butter|oat|vanilla|arctic|snow)\b/i

export function isDarkGarmentColourName(name: string | null | undefined): boolean {
  if (!name) return false
  if (LIGHT_COLOUR_RE.test(name)) return false
  return DARK_COLOUR_RE.test(name)
}
