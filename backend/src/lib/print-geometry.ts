/**
 * Backend mirror of the Studio's size maths
 * (storefront/src/modules/customizer/lib/print-geometry.ts): renders, staff
 * print placement and garment fit read these, never their own copies.
 * `pnpm check-print-geometry-sync` from the repo root fails if the two drift.
 *
 * Admin-reachable (print-placement is used by admin widgets): keep this file
 * free of @medusajs/framework imports.
 */

/** Oversize print area as a share of the canvas: 38 cm = 68% of width, 48 cm = 72% of height. */
export const PRINT_AREA_W_RATIO = 0.68
export const PRINT_AREA_H_RATIO = 0.72

/** Every Studio frame is `aspect-[4/5]`: canvas height = width × 5/4. */
export const FRAME_ASPECT = 1.25

/** Print-area guide sizes (cm) that canvas px are measured against. */
export const PRINT_SIZE_REF_CM: Record<string, { width: number; height: number }> = {
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

/**
 * The canvas a saved design was made on: `design.canvas` when stored (since
 * 2026-10-29), else the centred print area's width on the 4:5 frame. Never
 * from `scpPrintSizeId` — mixed per-side sizes store a printArea that doesn't
 * match it (26 of 65 order lines, 2026-10).
 */
export const savedCanvasSize = (design: {
  canvas?: { width?: unknown; height?: unknown } | null
  printArea?: { x?: unknown; width?: unknown } | null
}): CanvasSize | null => {
  const c = design.canvas
  if (c && Number(c.width) > 0 && Number(c.height) > 0) {
    return { width: Number(c.width), height: Number(c.height) }
  }
  const width = 2 * Number(design.printArea?.x) + Number(design.printArea?.width)
  return Number.isFinite(width) && width > 0 ? { width, height: width * FRAME_ASPECT } : null
}

/** Millimetres per canvas px on each axis (oversize area = 380 × 480 mm). */
export const mmPerCanvasPx = (canvas: CanvasSize) => ({
  x: (PRINT_SIZE_REF_CM.oversize.width * 10) / (canvas.width * PRINT_AREA_W_RATIO),
  y: (PRINT_SIZE_REF_CM.oversize.height * 10) / (canvas.height * PRINT_AREA_H_RATIO),
})
