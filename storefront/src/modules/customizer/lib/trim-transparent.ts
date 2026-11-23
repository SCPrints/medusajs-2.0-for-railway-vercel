/**
 * Canva and similar tools export a small logo on a big transparent page. The
 * Studio sized and priced prints by the whole image, so a 10 cm chest logo
 * measured ~13 × 18 cm and was charged as A4 instead of A6 (That Ability,
 * Oct 2026). Crop the fully transparent edges off an upload before it goes on
 * the garment. The customer's original file is kept as uploaded.
 */

/** Pixels at or below this alpha count as empty (soft shadows above it stay). */
const ALPHA_EMPTY = 8

export type Box = { x: number; y: number; width: number; height: number }

/** Bounding box of the visible pixels in RGBA data, or null when nothing is visible. */
export function alphaBoundingBox(data: Uint8ClampedArray, width: number, height: number, alphaEmpty = ALPHA_EMPTY): Box | null {
  let top = -1
  let bottom = -1
  let left = width
  let right = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > alphaEmpty) {
        if (top < 0) top = y
        bottom = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  if (top < 0) return null
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/** Worth cropping: the visible box is meaningfully smaller than the image. */
export function worthTrimming(box: Box | null, width: number, height: number): box is Box {
  return !!box && (box.width < width * 0.97 || box.height < height * 0.97)
}

// shortcut: images over ~40 MP are left as they are (memory on phones); trim offline if one ever matters.
const MAX_PIXELS = 40_000_000

/**
 * A PNG data URL with the transparent edges cropped off (from a data URL or a
 * hosted PNG/WebP), or the input unchanged (no transparency, nothing to crop, too big, or any failure).
 */
export async function trimTransparentEdges(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || !/^data:image\/(png|webp|gif)|^https:\/\/[^?#]+\.(png|webp)(?:[?#]|$)/i.test(dataUrl)) return dataUrl
  try {
    const img = new Image()
    // Hosted re-uploads: without CORS the pixels can't be read and we keep the original.
    img.crossOrigin = "anonymous"
    img.src = dataUrl
    await img.decode()
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h || w * h > MAX_PIXELS) return dataUrl
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0)
    const box = alphaBoundingBox(ctx.getImageData(0, 0, w, h).data, w, h)
    if (!worthTrimming(box, w, h)) return dataUrl
    const out = document.createElement("canvas")
    out.width = box.width
    out.height = box.height
    out.getContext("2d")?.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
    return out.toDataURL("image/png")
  } catch {
    return dataUrl
  }
}
