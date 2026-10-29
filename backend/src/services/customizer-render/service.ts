import sharp from "sharp"
import { MOCKUP_SCALE_ORIGIN, TAG_ZOOM } from "../../lib/print-geometry"
import { ulid } from "ulid"
import { Client } from "minio"
import { MedusaError } from "@medusajs/framework/utils"
import {
  BACKEND_URL,
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_PUBLIC_URL,
  MINIO_SECRET_KEY,
} from "../../lib/constants"
import { RenderRequestPayload } from "./types"

const DEFAULT_MOCKUP_SIZE = {
  width: 1200,
  height: 1500,
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
]

const clampDimension = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.floor(value)))

const isPrivateHost = (host: string) => PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))

export const validateGarmentImageUrl = (value: string) => {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Garment image URL is invalid.")
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only HTTP(S) garment image URLs are allowed."
    )
  }

  const host = parsed.hostname.toLowerCase()
  /** Local dev uses same-origin garment URLs (e.g. localhost sleeve placeholders); production should use public CDN URLs. */
  const isProduction = process.env.NODE_ENV === "production"
  const explicitPrivateOk =
    String(process.env.CUSTOMIZER_ALLOW_PRIVATE_GARMENT_URLS ?? "")
      .trim()
      .toLowerCase() === "true"
  const allowPrivateGarmentUrls = explicitPrivateOk || !isProduction

  if (!allowPrivateGarmentUrls && isPrivateHost(host)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Private or local network garment image URLs are not allowed."
    )
  }

  const allowedHosts = (process.env.CUSTOMIZER_GARMENT_IMAGE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (allowedHosts.length && !allowedHosts.includes(host)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Garment image host is not in the allowed list."
    )
  }

  return parsed.toString()
}

export const rethrowIfMedusaError = (error: unknown) => {
  if (
    error instanceof MedusaError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "MedusaError" &&
      typeof (error as { message?: unknown }).message === "string")
  ) {
    throw error
  }
}

export const getMinioConfig = () => {
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
    return null
  }

  let endPoint = MINIO_ENDPOINT
  let useSSL = true
  let port = 443

  if (endPoint.startsWith("https://")) {
    endPoint = endPoint.replace("https://", "")
    useSSL = true
    port = 443
  } else if (endPoint.startsWith("http://")) {
    endPoint = endPoint.replace("http://", "")
    useSSL = false
    port = 80
  }

  endPoint = endPoint.replace(/\/$/, "")
  const portMatch = endPoint.match(/:(\d+)$/)
  if (portMatch) {
    port = parseInt(portMatch[1], 10)
    endPoint = endPoint.replace(/:(\d+)$/, "")
  }

  return {
    endPoint,
    useSSL,
    port,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
    bucket: MINIO_BUCKET || "medusa-media",
    publicUrl: MINIO_PUBLIC_URL?.replace(/\/$/, "") || null,
  }
}

const uploadToMinio = async (buffer: Buffer, fileName: string, mimeType: string) => {
  const config = getMinioConfig()
  if (!config) {
    return null
  }

  const client = new Client({
    endPoint: config.endPoint,
    useSSL: config.useSSL,
    port: config.port,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  })

  const key = `customizer/${fileName}`
  try {
    await client.putObject(config.bucket, key, buffer, buffer.length, {
      "Content-Type": mimeType,
      "x-amz-acl": "public-read",
    })
  } catch {
    // Storage misconfiguration should not block add-to-cart in local/dev flows.
    // Callers already fall back to compact inline data URLs when this returns null.
    return null
  }

  // Prefer the public CDN/R2 host when configured. The S3 API endpoint
  // (MINIO_ENDPOINT) on Cloudflare R2 requires auth and returns 401/403 to
  // anonymous browser fetches — only `MINIO_PUBLIC_URL` is publicly readable.
  if (config.publicUrl) {
    return `${config.publicUrl}/${key}`
  }
  const protocol = config.useSSL ? "https" : "http"
  return `${protocol}://${config.endPoint}/${config.bucket}/${key}`
}

const dataUrlFromBuffer = (buffer: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`

/**
 * Fabric `toSVG()` plus Sharp density can yield a bitmap not exactly matching the editor canvas;
 * normalize so placement pixels match the storefront.
 */
const REMOTE_SVG_IMAGE_PATTERN = /(xlink:href|href)="(https?:\/\/[^"]+)"/g

const isSafeRemoteImageUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false
    }
    if (
      process.env.NODE_ENV === "production" &&
      isPrivateHost(parsed.hostname.toLowerCase())
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Customer-original uploads were historically stored under the R2 *S3 API*
 * endpoint (`<acct>.r2.cloudflarestorage.com/<bucket>/<key>`), which requires
 * SigV4 auth and returns 400/401 to the unauthenticated fetch() below — so the
 * artwork never inlined and the print PNG + mockup rendered BLANK. The very
 * same object is public at `MINIO_PUBLIC_URL/<key>`. Rewrite our own
 * private-endpoint URLs to that public host before fetching, so designs already
 * stored with the private URL still render (no re-upload needed). Foreign hosts
 * (supplier CDNs, public `*.r2.dev` URLs) pass through untouched.
 */
export const rewriteOwnR2UrlToPublic = (rawUrl: string): string => {
  if (!MINIO_ENDPOINT || !MINIO_PUBLIC_URL) {
    return rawUrl
  }
  try {
    const parsed = new URL(rawUrl)
    const endpointHost = MINIO_ENDPOINT.replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:(\d+)$/, "")
      .toLowerCase()
    if (parsed.hostname.toLowerCase() !== endpointHost) {
      return rawUrl
    }
    const bucketPrefix = `/${MINIO_BUCKET || "medusa-media"}/`
    if (!parsed.pathname.startsWith(bucketPrefix)) {
      return rawUrl
    }
    const keyPath = parsed.pathname.slice(bucketPrefix.length)
    return `${MINIO_PUBLIC_URL.replace(/\/$/, "")}/${keyPath}`
  } catch {
    return rawUrl
  }
}

/**
 * sharp/librsvg does NOT fetch remote `<image href="https://…">` references
 * when rasterizing an SVG — only inline `data:` URIs are drawn. The storefront
 * swaps the artwork's inline base64 for its hosted R2 URL to keep the render
 * payload under the serverless body limit (see replaceInlineRasterWithHostedUrls
 * in the storefront), so WITHOUT re-inlining here the artwork rasterizes BLANK
 * (blank print PNG + artwork-less mockup). Fetch each remote image server-side
 * — R2 is reachable here, the same way the garment image is fetched below — and
 * inline it as a `data:` URI so sharp can draw it. Best-effort: a failed or
 * blocked fetch leaves the URL in place (that one image stays blank, no worse
 * than before) and never throws, so a flaky CDN can't take the whole render down.
 */
/**
 * Renders rasterise at ~2× editor size, so a 600 dpi A3 original (~9000×11000 px,
 * ~400 MB decoded, per concurrent render) is pure waste — it OOM-killed the 4 GB
 * machine on 2026-10-28. Shrink anything bigger than this before inlining; the
 * SVG <image> has explicit width/height, so placement is unchanged. Customer
 * originals on R2 are untouched.
 */
const MAX_INLINE_IMAGE_EDGE = 3000

export const shrinkForRender = async (
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string; shrunk: boolean }> => {
  if (!/^image\/(png|jpe?g|webp)/i.test(contentType)) {
    return { buffer, contentType, shrunk: false }
  }
  try {
    const meta = await sharp(buffer).metadata()
    if (Math.max(meta.width ?? 0, meta.height ?? 0) <= MAX_INLINE_IMAGE_EDGE) {
      return { buffer, contentType, shrunk: false }
    }
    // sequentialRead lets libvips stream the decode instead of holding the full bitmap.
    const out = await sharp(buffer, { sequentialRead: true })
      .resize({
        width: MAX_INLINE_IMAGE_EDGE,
        height: MAX_INLINE_IMAGE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer()
    return { buffer: out, contentType: "image/png", shrunk: true }
  } catch {
    return { buffer, contentType, shrunk: false }
  }
}

/**
 * At most two heavy image jobs at once (renders + render-copy shrinks). One
 * "Add to cart" on a front+back design fires four renders together; with big
 * artwork that stacked decodes until the 4 GB machine was OOM-killed.
 */
// ponytail: in-process semaphore — fine on one machine; needs a shared queue if we scale out.
const MAX_CONCURRENT_RENDERS = 2
let activeRenders = 0
const renderQueue: Array<() => void> = []

export const withRenderSlot = async <T>(job: () => Promise<T>): Promise<T> => {
  if (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => renderQueue.push(resolve)) // slot handed over below
  } else {
    activeRenders++
  }
  try {
    return await job()
  } finally {
    const next = renderQueue.shift()
    if (next) next()
    else activeRenders--
  }
}

/**
 * Render copy of a customer upload: `customizer/render/<original name>.png`,
 * at most MAX_INLINE_IMAGE_EDGE px. Written once (at upload, or lazily on the
 * first render of an older upload) so renders never decode the 600 dpi
 * original again. Only for our own bucket; originals stay untouched.
 */
export const renderCopyUrl = (originalUrl: string): string | null => {
  const publicUrl = getMinioConfig()?.publicUrl
  if (!publicUrl) return null
  const prefix = `${publicUrl}/customizer/`
  if (!originalUrl.startsWith(prefix)) return null
  const name = originalUrl.slice(prefix.length)
  if (!name || name.includes("/")) return null
  return `${prefix}render/${name}.png`
}

/** Shrink `buffer` and store it as the render copy of `originalUrl` (no-op when it's already small). */
const storeRenderCopy = (copyUrl: string, png: Buffer) =>
  uploadToMinio(png, copyUrl.slice(copyUrl.indexOf("/customizer/") + "/customizer/".length), "image/png")

/** Shrink an upload and store it as its render copy (no-op when it's already render-sized). */
export const writeRenderCopy = async (originalUrl: string, buffer: Buffer, contentType: string) => {
  const target = renderCopyUrl(originalUrl)
  if (!target) return
  const shrunk = await withRenderSlot(() => shrinkForRender(buffer, contentType))
  if (shrunk.shrunk) await storeRenderCopy(target, shrunk.buffer)
}

const fetchImage = async (url: string): Promise<{ buffer: Buffer; contentType: string } | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length ? { buffer, contentType } : null
  } finally {
    clearTimeout(timeout)
  }
}

const fetchInlineDataUri = async (url: string): Promise<string | null> => {
  if (!isSafeRemoteImageUrl(url)) {
    return null
  }
  try {
    const publicUrl = rewriteOwnR2UrlToPublic(url)
    const copyUrl = renderCopyUrl(publicUrl)
    const copy = copyUrl ? await fetchImage(copyUrl).catch(() => null) : null
    if (copy) {
      return `data:${copy.contentType};base64,${copy.buffer.toString("base64")}`
    }
    const fetched = await fetchImage(publicUrl)
    if (!fetched) {
      return null
    }
    const shrunk = await shrinkForRender(fetched.buffer, fetched.contentType)
    if (shrunk.shrunk && copyUrl) {
      // Older upload with no render copy yet: save it so this is the last full decode.
      void storeRenderCopy(copyUrl, shrunk.buffer).catch(() => undefined)
    }
    return `data:${shrunk.contentType};base64,${shrunk.buffer.toString("base64")}`
  } catch {
    // Leave the URL in place — that image renders blank, no worse than before.
    return null
  }
}

/**
 * One "Add to cart / quote" fires print + mockup for every side at once, all
 * with the same artwork; shrinking a 600 dpi original 4× in parallel took ~27 s.
 * Share the in-flight work and keep recent results. Upload URLs are immutable
 * (ULID keys), so caching by URL is safe; failures are dropped so they retry.
 */
// ponytail: in-process FIFO of 24 entries (~a few MB each); move to R2 render copies if it grows.
const INLINE_CACHE_MAX = 24
const inlineCache = new Map<string, Promise<string | null>>()

const loadInlineDataUri = (url: string): Promise<string | null> => {
  const hit = inlineCache.get(url)
  if (hit) return hit
  const pending = fetchInlineDataUri(url).then((value) => {
    if (!value) inlineCache.delete(url)
    return value
  })
  inlineCache.set(url, pending)
  if (inlineCache.size > INLINE_CACHE_MAX) {
    inlineCache.delete(inlineCache.keys().next().value as string)
  }
  return pending
}

const inlineRemoteSvgImages = async (svg: string): Promise<string> => {
  if (!svg.includes("http")) {
    return svg
  }
  const urls = new Set<string>()
  REMOTE_SVG_IMAGE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REMOTE_SVG_IMAGE_PATTERN.exec(svg)) !== null) {
    urls.add(match[2])
  }
  if (urls.size === 0) {
    return svg
  }

  const inlinedByUrl = new Map<string, string>()
  await Promise.all(
    Array.from(urls).map(async (url) => {
      const dataUri = await loadInlineDataUri(url)
      if (dataUri) inlinedByUrl.set(url, dataUri)
    })
  )

  if (inlinedByUrl.size === 0) {
    return svg
  }

  return svg.replace(REMOTE_SVG_IMAGE_PATTERN, (whole, attr: string, url: string) => {
    const inlined = inlinedByUrl.get(url)
    return inlined ? `${attr}="${inlined}"` : whole
  })
}

const rasterizeCustomizerSvgToCanvas = async (
  svgBuffer: Buffer,
  canvas?: { width: number; height: number },
  density = 144
): Promise<{ buffer: Buffer; width: number; height: number }> => {
  // Re-inline remote <image href> URLs first: the storefront swaps inline
  // rasters for hosted R2 URLs to shrink the payload, and sharp won't fetch
  // them — without this the artwork rasterizes blank.
  const inlinedSvg = await inlineRemoteSvgImages(svgBuffer.toString("utf8"))
  let buf = await sharp(Buffer.from(inlinedSvg), { density })
    .ensureAlpha()
    .png()
    .toBuffer()
  let meta = await sharp(buf).metadata()
  let w = meta.width ?? 0
  let h = meta.height ?? 0

  if (
    canvas?.width &&
    canvas?.height &&
    (w !== canvas.width || h !== canvas.height)
  ) {
    buf = await sharp(buf)
      .resize(canvas.width, canvas.height)
      .png()
      .toBuffer()
    meta = await sharp(buf).metadata()
    w = meta.width ?? canvas.width
    h = meta.height ?? canvas.height
  }

  if (!w || !h) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Customizer SVG did not rasterize to a valid bitmap."
    )
  }

  return { buffer: buf, width: w, height: h }
}

/** Hex `#RRGGBB` → {r,g,b}; null on malformed input. */
const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const v = parseInt(m[1], 16)
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff }
}

/**
 * Recolour a generic white sleeve placeholder so the final mockup picks up
 * the garment colour. Replicates the storefront's CSS effect (canvas-stage):
 *
 *   - Light tint  → "multiply" the tint into every pixel. White body picks
 *                   up the tint, dark line work stays dark.
 *   - Dark tint   → invert the placeholder, then take pixel-wise max with
 *                   the tint (equivalent to `lighten` blend with `filter:
 *                   invert(1)`). Body becomes the dark tint colour, lines
 *                   render bright so they're still readable.
 *
 * Luminance threshold of 0.4 (Rec.709) matches the storefront so the preview
 * and the rendered mockup agree on which branch was taken.
 */
const tintSleevePlaceholder = async (
  placeholderBuf: Buffer,
  hex: string
): Promise<Buffer> => {
  const tint = parseHex(hex)
  if (!tint) return placeholderBuf

  const { data, info } = await sharp(placeholderBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = info.width * info.height
  const out = Buffer.from(data)

  const lum = (0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b) / 255
  const isDark = lum < 0.4

  for (let i = 0; i < pixels; i++) {
    const off = i * 4
    const r = data[off]
    const g = data[off + 1]
    const b = data[off + 2]
    if (isDark) {
      // invert + lighten(tint, inverted)
      out[off] = Math.max(tint.r, 255 - r)
      out[off + 1] = Math.max(tint.g, 255 - g)
      out[off + 2] = Math.max(tint.b, 255 - b)
    } else {
      // multiply(tint, original)
      out[off] = Math.round((tint.r * r) / 255)
      out[off + 1] = Math.round((tint.g * g) / 255)
      out[off + 2] = Math.round((tint.b * b) / 255)
    }
    // alpha unchanged
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
}

// Matches CanvasStage's printed-tag zoom (lib/print-geometry.ts TAG_ZOOM).
const TAG_ZOOM_SCALE = TAG_ZOOM.scale
const TAG_ORIGIN_X = TAG_ZOOM.originX
const TAG_ORIGIN_Y = TAG_ZOOM.originY

/**
 * For `printed_tag` the storefront zooms the garment image (CSS scale(3.2),
 * transform-origin: 50% 14%) while leaving the Fabric canvas unscaled. The
 * backend must replicate that crop so the artwork composite lands in the same
 * relative position. Steps:
 *   1. Apply object-cover (garmentCoverMatchCanvas) to get W×H.
 *   2. Crop the tag-visible region: top-left (originX - 1/(2*scale), originY*(1-1/scale)),
 *      size W/scale × H/scale.
 *   3. Resize the crop back to W×H.
 */
const garmentTagViewMatchCanvas = async (
  garmentBuffer: Buffer,
  viewportWidth: number,
  viewportHeight: number
): Promise<Buffer> => {
  // Step 1: object-cover crop
  const covered = await garmentCoverMatchCanvas(garmentBuffer, viewportWidth, viewportHeight)

  // Step 2: tag crop (exact inverse of the CSS transform)
  const cropLeft = Math.round((TAG_ORIGIN_X - 1 / (2 * TAG_ZOOM_SCALE)) * viewportWidth)
  const cropTop = Math.round(TAG_ORIGIN_Y * (1 - 1 / TAG_ZOOM_SCALE) * viewportHeight)
  const cropWidth = Math.round(viewportWidth / TAG_ZOOM_SCALE)
  const cropHeight = Math.round(viewportHeight / TAG_ZOOM_SCALE)

  // Clamp to safe bounds
  const left = Math.max(0, cropLeft)
  const top = Math.max(0, cropTop)
  const width = Math.min(cropWidth, viewportWidth - left)
  const height = Math.min(cropHeight, viewportHeight - top)

  // Step 3: resize back to canvas dimensions
  return sharp(covered)
    .extract({ left, top, width, height })
    .resize(viewportWidth, viewportHeight)
    .png()
    .toBuffer()
}

/**
 * Mirrors CSS `object-fit: cover`: center crop then resize to viewport (same as storefront img).
 */
const garmentCoverMatchCanvas = async (
  garmentBuffer: Buffer,
  viewportWidth: number,
  viewportHeight: number
) => {
  const meta = await sharp(garmentBuffer).metadata()
  const iw = meta.width ?? viewportWidth
  const ih = meta.height ?? viewportHeight
  if (iw < 1 || ih < 1) {
    return sharp(garmentBuffer).resize(viewportWidth, viewportHeight).png().toBuffer()
  }

  const scale = Math.max(viewportWidth / iw, viewportHeight / ih)
  let extractWidth = Math.floor(viewportWidth / scale)
  let extractHeight = Math.floor(viewportHeight / scale)
  extractWidth = Math.min(extractWidth, iw)
  extractHeight = Math.min(extractHeight, ih)

  let left = Math.floor((iw - extractWidth) / 2)
  let top = Math.floor((ih - extractHeight) / 2)
  left = clampDimension(left, 0, Math.max(0, iw - 1))
  top = clampDimension(top, 0, Math.max(0, ih - 1))
  extractWidth = Math.min(extractWidth, iw - left)
  extractHeight = Math.min(extractHeight, ih - top)

  return sharp(garmentBuffer)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .resize(viewportWidth, viewportHeight)
    .png()
    .toBuffer()
}

export const renderPrintAsset = async (payload: RenderRequestPayload) => {
  const svgBuffer = Buffer.from(payload.artworkSvg)
  const { buffer: fullPng, width: imgW, height: imgH } = await rasterizeCustomizerSvgToCanvas(
    svgBuffer,
    payload.canvas
  )

  const alphaSource = await sharp(fullPng).ensureAlpha().png().toBuffer()

  /**
   * Production file: tight crop around opaque pixels (not the dashed print-area box unless needed).
   * Some SVG → PNG paths paint an opaque white full-canvas bleed; `.trim()` would then refuse to shrink.
   * In that case we fall back to the print rectangle from the payload + trim inside that.
   */
  let printBuffer: Buffer
  try {
    printBuffer = await sharp(alphaSource)
      .trim({ threshold: 8, lineArt: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch {
    printBuffer = alphaSource
  }

  const boxMeta = await sharp(printBuffer).metadata()
  const stillFullBleed =
    boxMeta.width &&
    boxMeta.height &&
    imgW > 50 &&
    imgH > 50 &&
    boxMeta.width >= Math.floor(imgW * 0.9) &&
    boxMeta.height >= Math.floor(imgH * 0.9)

  if (printBuffer.length < 80 || stillFullBleed) {
    const px = clampDimension(Math.floor(payload.placement.x), 0, Math.max(0, imgW - 1))
    const py = clampDimension(Math.floor(payload.placement.y), 0, Math.max(0, imgH - 1))
    const maxW = Math.max(1, imgW - px)
    const maxH = Math.max(1, imgH - py)
    const ew = clampDimension(Math.round(payload.placement.width), 1, Math.min(maxW, 4000))
    const eh = clampDimension(Math.round(payload.placement.height), 1, Math.min(maxH, 4000))
    printBuffer = await sharp(alphaSource)
      .extract({ left: px, top: py, width: ew, height: eh })
      .ensureAlpha()
      .trim({ threshold: 16, lineArt: true })
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  const outMeta = await sharp(printBuffer).metadata()

  const fileName = `print-${payload.side}-${ulid()}.png`
  const minioUrl = await uploadToMinio(printBuffer, fileName, "image/png")

  return {
    url: minioUrl ?? dataUrlFromBuffer(printBuffer, "image/png"),
    bytes: printBuffer.length,
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
  }
}

/**
 * Where the artwork overlay lands when shrunk by `artworkScale`. Mirrors the
 * storefront CSS `scale(s)` with origin 50% 13% (MOCKUP_SCALE_ORIGIN in
 * storefront print-spec.ts): garment centre line, top of the print zone.
 */
export const scaledOverlayBox = (width: number, height: number, scale: number) => ({
  left: Math.round(width * MOCKUP_SCALE_ORIGIN.x * (1 - scale)),
  top: Math.round(height * MOCKUP_SCALE_ORIGIN.y * (1 - scale)),
  width: Math.max(1, Math.round(width * scale)),
  height: Math.max(1, Math.round(height * scale)),
})

/**
 * The editor canvas is only as big as the customer's screen (~300 px wide on a
 * phone or the PDP), and the mockup used to be rendered at exactly that size —
 * proofs (order #118) came out 305×381 px and the artwork was unreadable.
 * Render at least this many px on the long edge, same proportions.
 */
const MOCKUP_MIN_LONG_EDGE = 1600

/** Editor canvas → mockup output size and the SVG density that hits it exactly. */
export const mockupOutputSize = (canvas?: { width: number; height: number }) => {
  if (!canvas?.width || !canvas?.height) return { canvas, density: 144 }
  const k = Math.max(1, MOCKUP_MIN_LONG_EDGE / Math.max(canvas.width, canvas.height))
  return {
    canvas: { width: Math.round(canvas.width * k), height: Math.round(canvas.height * k) },
    // SVG user units = editor px at 72 dpi, so 72·k rasterises straight to the
    // output size (never below the old 144, so small upscales stay sharp).
    density: Math.max(144, Math.ceil(72 * k)),
  }
}

export const renderMockupAsset = async (payload: RenderRequestPayload) => {
  const artworkSvgBuffer = Buffer.from(payload.artworkSvg)
  const { canvas: canvasDims, density } = mockupOutputSize(payload.canvas)

  /**
   * Full-canvas PNG (editor proportions, scaled up): composite at (0,0) onto the garment bitmap
   * that matches CSS `object-cover`, so logos land exactly where users position them — no slicing
   * + re-placing artwork with error-prone x/y bookkeeping.
   */
  const { buffer: overlayRaw } = await rasterizeCustomizerSvgToCanvas(
    artworkSvgBuffer,
    canvasDims,
    density
  )
  const fullOverlay = await sharp(overlayRaw).ensureAlpha().png().toBuffer()

  let mockupWidth: number
  let mockupHeight: number

  let garmentBase: Buffer
  if (payload.garmentImageUrl) {
    try {
      const garmentImageUrl = validateGarmentImageUrl(payload.garmentImageUrl)
      const response = await fetch(garmentImageUrl)
      if (!response.ok) {
        throw new Error(`Garment source returned ${response.status}`)
      }

      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.startsWith("image/")) {
        throw new Error("Garment source did not return an image payload")
      }

      const arrayBuffer = await response.arrayBuffer()
      let rawGarment = Buffer.from(arrayBuffer)
      if (canvasDims?.width && canvasDims?.height) {
        garmentBase =
          payload.side === "printed_tag"
            ? await garmentTagViewMatchCanvas(rawGarment, canvasDims.width, canvasDims.height)
            : await garmentCoverMatchCanvas(rawGarment, canvasDims.width, canvasDims.height)
        mockupWidth = canvasDims.width
        mockupHeight = canvasDims.height
      } else {
        const gm = await sharp(rawGarment).metadata()
        mockupWidth = gm.width ?? DEFAULT_MOCKUP_SIZE.width
        mockupHeight = gm.height ?? DEFAULT_MOCKUP_SIZE.height
        garmentBase = rawGarment
      }
    } catch (error) {
      rethrowIfMedusaError(error)

      mockupWidth = canvasDims?.width ?? DEFAULT_MOCKUP_SIZE.width
      mockupHeight = canvasDims?.height ?? DEFAULT_MOCKUP_SIZE.height

      garmentBase = await sharp({
        create: {
          width: mockupWidth,
          height: mockupHeight,
          channels: 4,
          background: "#f3f4f6",
        },
      })
        .png()
        .toBuffer()
    }
  } else {
    mockupWidth = canvasDims?.width ?? DEFAULT_MOCKUP_SIZE.width
    mockupHeight = canvasDims?.height ?? DEFAULT_MOCKUP_SIZE.height

    garmentBase = await sharp({
      create: {
        width: mockupWidth,
        height: mockupHeight,
        channels: 4,
        background: "#f3f4f6",
      },
    })
      .png()
      .toBuffer()
  }

  if (!(payload.garmentImageUrl && canvasDims?.width && canvasDims?.height)) {
    const garmentMeta = await sharp(garmentBase).metadata()
    mockupWidth = garmentMeta.width ?? mockupWidth
    mockupHeight = garmentMeta.height ?? mockupHeight
  }

  // Recolour the generic sleeve placeholder so the rendered mockup picks up
  // the variant colour (storefront preview already does this via CSS).
  // No-op for non-sleeve sides or when the storefront couldn't sample a tint.
  if (
    payload.tintColor &&
    (payload.side === "left_sleeve" || payload.side === "right_sleeve")
  ) {
    try {
      garmentBase = await tintSleevePlaceholder(garmentBase, payload.tintColor)
    } catch {
      // Tinting is best-effort — fall back to the uncoloured placeholder.
    }
  }

  const overlayMeta = await sharp(fullOverlay).metadata()
  let overlayBuf = fullOverlay
  if (
    canvasDims?.width &&
    canvasDims?.height &&
    (overlayMeta.width !== mockupWidth || overlayMeta.height !== mockupHeight)
  ) {
    overlayBuf = await sharp(fullOverlay)
      .resize(mockupWidth, mockupHeight)
      .png()
      .toBuffer()
  }

  const scale = payload.artworkScale ?? 1
  const box = scaledOverlayBox(mockupWidth, mockupHeight, scale)
  if (scale < 1) {
    overlayBuf = await sharp(overlayBuf).resize(box.width, box.height).png().toBuffer()
  }

  const mockupBuffer = await sharp(garmentBase)
    .composite([
      {
        input: overlayBuf,
        left: scale < 1 ? box.left : 0,
        top: scale < 1 ? box.top : 0,
        blend: "over",
      },
    ])
    .jpeg({ quality: 82 })
    .toBuffer()

  const fileName = `mockup-${payload.side}-${ulid()}.jpg`
  const minioUrl = await uploadToMinio(mockupBuffer, fileName, "image/jpeg")

  return {
    url: minioUrl ?? dataUrlFromBuffer(mockupBuffer, "image/jpeg"),
    bytes: mockupBuffer.length,
    width: mockupWidth,
    height: mockupHeight,
    source: BACKEND_URL,
  }
}
