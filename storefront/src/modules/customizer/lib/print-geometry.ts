/**
 * The ONE place the Studio's size maths lives: canvas px ↔ print area ↔ cm,
 * the mockup zoom, the tag zoom, and how a saved design's canvas is recovered.
 *
 * MIRRORED in backend/src/lib/print-geometry.ts (renders, staff print
 * placement). `pnpm check-print-geometry-sync` from the repo root fails if the
 * two drift. Change both, never one.
 */
import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

/** Oversize print area as a share of the canvas: 38 cm = 68% of width, 48 cm = 72% of height. */
export const PRINT_AREA_W_RATIO = 0.68
export const PRINT_AREA_H_RATIO = 0.72

/** Every Studio frame is `aspect-[4/5]`: canvas height = width × 5/4. */
export const FRAME_ASPECT = 1.25

/**
 * Print-area GUIDE sizes (cm) that canvas px are measured against. Saved
 * designs decode their scale from this table — don't edit it to change what
 * a size allows (that's SCP_PRINT_SIZE_TRUE_CM in print-spec.ts).
 */
export const PRINT_SIZE_REF_CM: Record<ScpPrintSizeId, { width: number; height: number }> = {
  up_to_a6: { width: 8, height: 12 },
  up_to_a4: { width: 14, height: 20 },
  up_to_a3: { width: 19, height: 27 },
  oversize: { width: 38, height: 48 },
}

/** Where the mockup zoom is anchored: garment centre, top of the print zone. */
export const MOCKUP_SCALE_ORIGIN = { x: 0.5, y: 0.13 }

/** Printed-tag view: the garment photo is zoomed 3.2× around 50% / 14%. */
export const TAG_ZOOM = { scale: 3.2, originX: 0.5, originY: 0.14 }

export type CanvasSize = { width: number; height: number }
export type PrintArea = { x: number; y: number; width: number; height: number }

/** Print-area guide box (canvas px) for a print size; smaller sizes sit lower, toward the chest. */
export const getPrintArea = (
  width: number,
  height: number,
  printSizeId: ScpPrintSizeId = "oversize"
): PrintArea => {
  const base = PRINT_SIZE_REF_CM.oversize
  const ref = PRINT_SIZE_REF_CM[printSizeId] ?? base
  const baseH = height * PRINT_AREA_H_RATIO
  const areaW = width * PRINT_AREA_W_RATIO * (ref.width / base.width)
  const areaH = baseH * (ref.height / base.height)
  // Oversize keeps the top anchor at 13%; smaller sizes blend toward 30% so
  // they don't sit on the hood/collar of hoodies and similar garments.
  const topRatio = 0.13 + (0.3 - 0.13) * (1 - areaH / baseH)
  return { x: (width - areaW) / 2, y: height * topRatio, width: areaW, height: areaH }
}

/** Canvas px → cm on the garment (both axes measured against the oversize area). */
export const canvasPxToApproxCm = (pxWidth: number, pxHeight: number, canvasWidth: number, canvasHeight: number) => {
  if (canvasWidth <= 0 || canvasHeight <= 0) return { width: 0, height: 0 }
  const o = PRINT_SIZE_REF_CM.oversize
  return {
    width: pxWidth * (o.width / (canvasWidth * PRINT_AREA_W_RATIO)),
    height: pxHeight * (o.height / (canvasHeight * PRINT_AREA_H_RATIO)),
  }
}

/** Canvas px per printed inch, on the same scale as production (38 cm = 68% of canvas width). */
export const canvasPxPerInch = (canvasWidth: number): number =>
  ((canvasWidth * PRINT_AREA_W_RATIO) / PRINT_SIZE_REF_CM.oversize.width) * 2.54

/**
 * The canvas a saved design was made on. New designs store it (`canvas`).
 * Older ones don't: the print area is horizontally centred, so its width is
 * exact (2·x + width) and the frame is 4:5. Never derive it from
 * `scpPrintSizeId` — designs with different sizes per side stored one
 * printArea that doesn't match it (26 of 65 order lines, 2026-10), and that
 * reopened artwork ~10% of the shirt out of place.
 */
export const savedCanvasSize = (design: {
  canvas?: Partial<CanvasSize> | null
  printArea?: Partial<PrintArea> | null
}): CanvasSize | null => {
  const c = design.canvas
  if (c && Number(c.width) > 0 && Number(c.height) > 0) {
    return { width: Number(c.width), height: Number(c.height) }
  }
  const p = design.printArea
  const width = 2 * Number(p?.x) + Number(p?.width)
  return Number.isFinite(width) && width > 0 ? { width, height: width * FRAME_ASPECT } : null
}

/**
 * The editor zooms the Fabric viewport by the mockup scale around
 * MOCKUP_SCALE_ORIGIN, so the whole garment photo stays editable. This is the
 * scene-space rect the frame shows: artwork may sit anywhere in it, and renders
 * export it (not just the 0..W × 0..H canvas). Equals the canvas at scale 1.
 */
export const mockupVisibleRect = (width: number, height: number, scale: number) => {
  const s = scale > 0 ? scale : 1
  const ox = width * MOCKUP_SCALE_ORIGIN.x
  const oy = height * MOCKUP_SCALE_ORIGIN.y
  return { x: ox - ox / s, y: oy - oy / s, width: width / s, height: height / s }
}

/** Fabric viewportTransform matching `mockupVisibleRect`. */
export const mockupViewportTransform = (width: number, height: number, scale: number) => {
  const s = scale > 0 ? scale : 1
  return [s, 0, 0, s, width * MOCKUP_SCALE_ORIGIN.x * (1 - s), height * MOCKUP_SCALE_ORIGIN.y * (1 - s)]
}

/** CSS for the printed-tag photo zoom (canvas stage + design preview). */
export const tagZoomStyle = {
  transform: `scale(${TAG_ZOOM.scale})`,
  transformOrigin: `${TAG_ZOOM.originX * 100}% ${TAG_ZOOM.originY * 100}%`,
} as const
