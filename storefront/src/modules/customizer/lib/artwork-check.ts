import { DPI_OK_THRESHOLD, classifyDpi } from "./dpi"

export type ArtworkCheck =
  | { ok: true; label: "Print-ready"; note?: string }
  | { ok: false; notes: string[] }

/** Without a stated print width, judge the file at a typical chest print. */
export const DEFAULT_CHECK_WIDTH_CM = 20

/**
 * Plain-language print check from what the browser knows at upload. No server, no AI.
 * `hasTransparency` is null when unknown (a PNG may or may not have a clear background).
 */
export function checkArtwork(input: {
  mimeType: string
  widthPx: number
  heightPx: number
  hasTransparency: boolean | null
  printWidthCm?: number
}): ArtworkCheck {
  const mime = input.mimeType.toLowerCase()
  if (mime === "image/svg+xml") return { ok: true, label: "Print-ready", note: "Vector file — perfect for any size." }

  const notes: string[] = []
  const widthCm = input.printWidthCm && input.printWidthCm > 0 ? input.printWidthCm : DEFAULT_CHECK_WIDTH_CM
  // Same bands as the Studio's live DPI warning (dpi.ts).
  const dpi = input.widthPx / (widthCm / 2.54)
  if (input.widthPx > 0 && classifyDpi(dpi) !== "ok") {
    const sharpCm = Math.floor((input.widthPx / DPI_OK_THRESHOLD) * 2.54)
    notes.push(`This picture is small. It will print sharp up to about ${sharpCm} cm wide.`)
  }
  if (mime === "image/jpeg" || mime === "image/jpg" || input.hasTransparency === false) {
    notes.push(
      "JPG pictures have a solid background. Send a PNG with a clear background if you don't want a box around it."
    )
  }
  return notes.length ? { ok: false, notes } : { ok: true, label: "Print-ready" }
}
