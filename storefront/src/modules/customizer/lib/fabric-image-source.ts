/**
 * Read source-pixel dimensions off a Fabric object, used at metadata-build
 * time so the customizer payload persists the original upload's resolution
 * (drives DPI assessment + server-side print rendering).
 *
 * Probes in priority order:
 *   1. `sourceWidthPx` / `sourceHeightPx` — custom properties stamped on the
 *      object when an SVG or raster is first loaded (so the value survives
 *      Fabric's serialize → deserialize round trip).
 *   2. `width` / `height` — Fabric's own dimensions (may already be scaled).
 *   3. The underlying `HTMLImageElement.natural*` — last-resort live read.
 *
 * Note: a *similar but stricter* helper lives in `./dpi.ts`
 * (`getFabricImageSourceWidthPx`) that returns `null` instead of `0` and
 * requires `type === "image"`. That one is for DPI math where "couldn't
 * compute" needs to be distinguishable from "zero pixels". The helpers
 * here are for the metadata-stamping path and intentionally return `0` as
 * a safe sentinel so the spread-into-metadata calls always have a number.
 */

export const getSourceWidthPx = (obj: any): number => {
  const direct = Number(obj?.sourceWidthPx ?? 0)
  if (direct > 0) {
    return direct
  }
  const w = obj?.width
  if (typeof w === "number" && w > 0) {
    return w
  }
  const el = obj?._element as HTMLImageElement | undefined
  if (el?.naturalWidth) {
    return el.naturalWidth
  }
  return 0
}

/**
 * `loadFromJSON` reviver. The canvas works on a ≤2000px copy of each upload,
 * but saved layouts swap `src` for the full-size R2 original while keeping the
 * copy's `width`/`height`. Fabric reads a width smaller than the image as a
 * crop, so the reload showed (and rendered) only the top-left corner — order
 * #118. The customizer has no crop tool, so any such mismatch is this bug:
 * resize to the real image and shrink the scale so it stays the same size.
 */
export const fitImageToSource = (_serialized: unknown, obj: any) => {
  if (typeof obj?.getOriginalSize !== "function" || obj.cropX || obj.cropY) {
    return
  }
  const { width: natW, height: natH } = obj.getOriginalSize()
  if (!natW || !natH || (natW === obj.width && natH === obj.height)) {
    return
  }
  obj.set({
    scaleX: (obj.scaleX * obj.width) / natW,
    scaleY: (obj.scaleY * obj.height) / natH,
    width: natW,
    height: natH,
    sourceWidthPx: natW,
    sourceHeightPx: natH,
  })
}

export const getSourceHeightPx = (obj: any): number => {
  const direct = Number(obj?.sourceHeightPx ?? 0)
  if (direct > 0) {
    return direct
  }
  const h = obj?.height
  if (typeof h === "number" && h > 0) {
    return h
  }
  const el = obj?._element as HTMLImageElement | undefined
  if (el?.naturalHeight) {
    return el.naturalHeight
  }
  return 0
}
