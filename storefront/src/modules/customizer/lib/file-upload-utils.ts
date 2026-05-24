import * as fabric from "fabric"

/** Read a `File` as text (used to read SVG markup before handing to Fabric). */
export const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsText(file)
  })

/** Read a `File` as a base64 data URL (used as the immediate preview source). */
export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Unable to read file"))
    reader.readAsDataURL(file)
  })

/**
 * Cap on the longest edge of the canvas-bound raster. 2000px sits above the
 * 300dpi requirement for our largest standard print (A4 ≈ 2480×3508 at 300dpi)
 * but we always downsample to the actual placement rect during server-side
 * render, so the canvas copy only needs to be sharp enough for the editor.
 *
 * Why this matters: a 4032×3024 iPhone photo encoded as base64 PNG inside the
 * SVG inside the JSON payload to /api/customizer/render-* easily exceeds
 * Vercel's 4.5MB function-body cap → 413 on both endpoints. Capping at 2000px
 * + JPEG-85 brings a typical phone photo from ~5MB → ~400KB.
 */
const CANVAS_RASTER_MAX_EDGE_PX = 2000
const CANVAS_RASTER_JPEG_QUALITY = 0.85

/**
 * Normalise a raster image upload by baking EXIF orientation into the pixel
 * data. Phone photos (especially iOS) routinely carry orientation metadata
 * that the browser's HTML <img> rendering applies but Fabric's SVG export
 * does NOT — Fabric serialises the un-rotated raw bytes, and Sharp on the
 * backend then renders the un-rotated image into the print PNG / mockup,
 * producing output that looks mirrored or rotated relative to what the
 * customer saw on screen.
 *
 * Rewrites the upload through a canvas using
 * `createImageBitmap(blob, { imageOrientation: "from-image" })` which decodes
 * with EXIF applied, then re-encodes as PNG with no EXIF metadata.
 * Server-side renders now see exactly what the customer saw.
 *
 * Falls back to the original data URL on any failure (very old browsers,
 * decode errors) so a transient issue never blocks the upload entirely.
 * SVGs skip this path — they're text, not raster, and have no EXIF.
 */
export const normalizeRasterDataUrl = async (
  file: File,
  fallbackDataUrl: string
): Promise<string> => {
  if (typeof window === "undefined") return fallbackDataUrl
  if (typeof createImageBitmap !== "function") return fallbackDataUrl
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
    try {
      const longest = Math.max(bitmap.width, bitmap.height)
      const scale =
        longest > CANVAS_RASTER_MAX_EDGE_PX ? CANVAS_RASTER_MAX_EDGE_PX / longest : 1
      const targetW = Math.max(1, Math.round(bitmap.width * scale))
      const targetH = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement("canvas")
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext("2d")
      if (!ctx) return fallbackDataUrl
      ctx.drawImage(bitmap, 0, 0, targetW, targetH)

      // JPEGs (typical iPhone camera output) re-encode as JPEG so the payload
      // stays small. PNGs are preserved as PNG to keep any transparency intact
      // — logo work depends on this.
      const isPng = file.type === "image/png"
      return isPng
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", CANVAS_RASTER_JPEG_QUALITY)
    } finally {
      bitmap.close?.()
    }
  } catch {
    return fallbackDataUrl
  }
}

/**
 * Parse an SVG string into a single Fabric object (group). Bridges the
 * callback-style Fabric 5 API and the promise-style Fabric 6 API so callers
 * can `await` either way.
 */
export const loadSvgObject = async (svg: string) => {
  const loader = (fabric as any).loadSVGFromString
  if (!loader) {
    throw new Error("SVG loader is unavailable")
  }

  const maybePromise = loader(svg)
  if (maybePromise && typeof maybePromise.then === "function") {
    const result = await maybePromise
    return (fabric as any).util.groupSVGElements(result.objects, result.options)
  }

  return new Promise<any>((resolve, reject) => {
    loader(svg, (objects: any[], options: Record<string, unknown>) => {
      if (!objects?.length) {
        reject(new Error("Could not parse SVG"))
        return
      }
      resolve((fabric as any).util.groupSVGElements(objects, options))
    })
  })
}
