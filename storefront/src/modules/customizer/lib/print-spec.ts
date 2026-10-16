/**
 * Helpers for the per-image print model. The visual print-area system in
 * `templates/index.tsx` maps the "oversize" reference (38×48 cm) onto the
 * canvas's 68% × 72% interior rectangle. Everything in this file derives
 * from that mapping so canvas-pixel measurements convert cleanly to
 * approximate real-world centimetres.
 */

import {
  getAllowedScpPrintSizesForSide,
  ScpPrintSizeId,
  SCP_A6_ONLY_SIDES,
} from "./scp-dtf-print-pricing"
import type { GarmentSide, PrintPricingSpec, PrintSpec } from "./types"

/**
 * Visual-reference physical sizes (cm). Mirrors `SCP_PRINT_SIZE_CM` in
 * templates/index.tsx; kept here so cm conversion has a self-contained
 * source of truth and tests can reach it without dragging in the canvas.
 */
export const SCP_PRINT_SIZE_REFERENCE_CM: Record<
  ScpPrintSizeId,
  { width: number; height: number }
> = {
  up_to_a6: { width: 8, height: 12 },
  up_to_a4: { width: 14, height: 20 },
  up_to_a3: { width: 19, height: 27 },
  oversize: { width: 38, height: 48 },
}

/**
 * The real print sizes we price and print (the labels customers see in
 * `SCP_PRINT_SIZE_OPTIONS`). The dashed guide above is drawn smaller on
 * purpose, but artwork must be able to reach the size that was paid for —
 * capping at the guide limited "A3" prints to 19 cm. Don't swap these into
 * the reference map: saved designs decode their scale from that one.
 */
export const SCP_PRINT_SIZE_TRUE_CM: Record<ScpPrintSizeId, { width: number; height: number }> = {
  up_to_a6: { width: 10, height: 15 },
  up_to_a4: { width: 21, height: 30 },
  up_to_a3: { width: 29, height: 42 },
  oversize: { width: 38, height: 48 },
}

/** Largest artwork box (canvas px) a print size allows — the inverse of `canvasPxToApproxCm`. */
export const maxArtworkPx = (
  sizeId: ScpPrintSizeId,
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } => {
  const t = SCP_PRINT_SIZE_TRUE_CM[sizeId] ?? SCP_PRINT_SIZE_TRUE_CM.oversize
  const o = SCP_PRINT_SIZE_REFERENCE_CM.oversize
  return {
    width: canvasWidth * 0.68 * (t.width / o.width),
    height: canvasHeight * 0.72 * (t.height / o.height),
  }
}

/** Tier ordering, smallest → largest. Used by the auto-snap selector. */
export const SCP_PRINT_SIZE_ORDER: ScpPrintSizeId[] = [
  "up_to_a6",
  "up_to_a4",
  "up_to_a3",
  "oversize",
]

/**
 * Constants pulled from `getPrintArea` in templates/index.tsx. Re-derived
 * here (not imported) so this module stays UI-agnostic and testable.
 */
const CANVAS_PRINT_AREA_W_RATIO = 0.68
const CANVAS_PRINT_AREA_H_RATIO = 0.72

/**
 * Convert a bounding-box pixel size on the live editor canvas to an
 * approximate physical centimetre size on the garment. Only the canvas
 * dimensions and the oversize reference are needed because every other
 * print size scales linearly off oversize.
 */
export const canvasPxToApproxCm = (
  pxWidth: number,
  pxHeight: number,
  canvasWidth: number,
  canvasHeight: number
): { width: number; height: number } => {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { width: 0, height: 0 }
  }
  const cmPerPxX = SCP_PRINT_SIZE_REFERENCE_CM.oversize.width /
    (canvasWidth * CANVAS_PRINT_AREA_W_RATIO)
  const cmPerPxY = SCP_PRINT_SIZE_REFERENCE_CM.oversize.height /
    (canvasHeight * CANVAS_PRINT_AREA_H_RATIO)
  return {
    width: pxWidth * cmPerPxX,
    height: pxHeight * cmPerPxY,
  }
}

/**
 * Canvas px per printed inch, on the same scale as `canvasPxToApproxCm` and
 * production (38 cm = 68% of canvas width). Feed this to the DPI check — the
 * old "print area = 12 inches" guess treated an A6 guide as 30 cm wide.
 */
export const canvasPxPerInch = (canvasWidth: number): number =>
  ((canvasWidth * CANVAS_PRINT_AREA_W_RATIO) / SCP_PRINT_SIZE_REFERENCE_CM.oversize.width) * 2.54

/**
 * Garment photos are framed by the supplier, not to our cm scale: the AS
 * Colour 5086 flat-lay body spans ~36 reference cm on the canvas but a real
 * Large is 59 cm, so artwork looked ~1.6× too big on the shirt. The mockup
 * scale (photo body cm ÷ real size-M body cm) shrinks the artwork layer on
 * screen and in the rendered mockup ONLY — Fabric coordinates, saved designs,
 * print files and production mm are untouched. Front/back only: sleeves use a
 * generic drawing and the tag view is zoomed.
 *
 * Sources, first valid wins: `metadata.mockup_scale` (staff override, may be
 * a string from the admin metadata editor), then `metadata.garment_fit`
 * (stamped from the brand's size chart + the photo by stamp-garment-fit.ts).
 */
export const MOCKUP_SCALE_ORIGIN = { x: 0.5, y: 0.13 } // garment centre, top of the print zone

const validScale = (raw: unknown): number | null => {
  const v = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
  return Number.isFinite(v) && v >= 0.3 && v <= 1 ? v : null
}

export const resolveMockupArtworkScale = (
  metadata: Record<string, unknown> | null | undefined,
  side: GarmentSide
): number => {
  if (side !== "front" && side !== "back") return 1
  const fit = metadata?.garment_fit as { mockup_scale?: unknown } | undefined
  return validScale(metadata?.mockup_scale) ?? validScale(fit?.mockup_scale) ?? 1
}

/** Size the mockup is drawn for ("M"), for the Studio caption; null when the scale isn't from a size chart. */
export const resolveMockupReferenceSize = (
  metadata: Record<string, unknown> | null | undefined
): string | null => {
  if (validScale(metadata?.mockup_scale) != null) return null
  const fit = metadata?.garment_fit as { mockup_scale?: unknown; reference_size?: unknown } | undefined
  return validScale(fit?.mockup_scale) != null && typeof fit?.reference_size === "string"
    ? fit.reference_size
    : null
}

export type SnapContext = {
  isLongSleeve: boolean
  /** Hat / cap garments — every side collapses to A6. */
  isHat?: boolean
}

/**
 * Pick the smallest tier that contains the supplied bounding box. If even
 * the largest tier is too small, returns the largest. Restricted sides
 * (e.g. printed_tag → A6, hats → A6 everywhere) are honoured so callers
 * don't have to remember that the picker is gated.
 *
 * Accepts either a boolean (legacy `isLongSleeve` shorthand) or a
 * SnapContext object — same affordance as `getAllowedScpPrintSizesForSide`.
 */
export const snapSizeForBoundingCm = (
  side: GarmentSide,
  approxCm: { width: number; height: number },
  context: boolean | SnapContext
): ScpPrintSizeId => {
  const ctx: SnapContext =
    typeof context === "boolean" ? { isLongSleeve: context } : context
  const allowed = getAllowedScpPrintSizesForSide(side, ctx)
  const orderedAllowed = SCP_PRINT_SIZE_ORDER.filter((id) => allowed.includes(id))
  if (!orderedAllowed.length) {
    return "up_to_a6"
  }
  const fits = orderedAllowed.find((id) => {
    const ref = SCP_PRINT_SIZE_TRUE_CM[id]
    return approxCm.width <= ref.width && approxCm.height <= ref.height
  })
  return fits ?? orderedAllowed[orderedAllowed.length - 1]
}

/**
 * Reduce a list of PrintSpec down to the pricing-only shape. Side-restricted
 * sizes are forced even if a stale manual override on the spec disagrees —
 * pricing always trusts the side restrictions to keep cart totals in sync
 * with what the customer can actually order.
 */
export const printSpecsToPricingSpecs = (specs: PrintSpec[]): PrintPricingSpec[] =>
  specs.map((spec) => ({
    side: spec.side,
    sizeId: SCP_A6_ONLY_SIDES.has(spec.side) ? "up_to_a6" : spec.sizeId,
  }))
