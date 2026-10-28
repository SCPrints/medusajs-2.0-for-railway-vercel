/**
 * Helpers for the per-image print model. All size maths (canvas px ↔ print
 * area ↔ cm, mockup zoom) lives in print-geometry.ts; this file adds the
 * pricing-side helpers on top and re-exports the geometry for older imports.
 */

import {
  getAllowedScpPrintSizesForSide,
  ScpPrintSizeId,
  SCP_A6_ONLY_SIDES,
} from "./scp-dtf-print-pricing"
import { PRINT_AREA_H_RATIO, PRINT_AREA_W_RATIO, PRINT_SIZE_REF_CM } from "./print-geometry"
import type { GarmentSide, PrintPricingSpec, PrintSpec } from "./types"

export {
  canvasPxPerInch,
  canvasPxToApproxCm,
  MOCKUP_SCALE_ORIGIN,
  mockupViewportTransform,
  mockupVisibleRect,
} from "./print-geometry"

/** The print-area guide sizes (cm) — see PRINT_SIZE_REF_CM in print-geometry.ts. */
export const SCP_PRINT_SIZE_REFERENCE_CM = PRINT_SIZE_REF_CM

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

/**
 * Largest artwork box (canvas px) a print size allows — the inverse of `canvasPxToApproxCm`.
 * Paper sizes turn sideways: wide artwork (`landscape`) gets the sheet rotated,
 * so a wordmark on A6 can be 15 cm wide, not stuck at 10 cm. Oversize stays
 * portrait — it's the whole print area.
 */
export const maxArtworkPx = (
  sizeId: ScpPrintSizeId,
  canvasWidth: number,
  canvasHeight: number,
  landscape = false
): { width: number; height: number } => {
  const t = SCP_PRINT_SIZE_TRUE_CM[sizeId] ?? SCP_PRINT_SIZE_TRUE_CM.oversize
  const o = SCP_PRINT_SIZE_REFERENCE_CM.oversize
  const turn = landscape && sizeId !== "oversize"
  return {
    width: canvasWidth * PRINT_AREA_W_RATIO * ((turn ? t.height : t.width) / o.width),
    height: canvasHeight * PRINT_AREA_H_RATIO * ((turn ? t.width : t.height) / o.height),
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
    // Either way up — a 14 × 4 cm wordmark is an A6 print turned sideways.
    return (
      (approxCm.width <= ref.width && approxCm.height <= ref.height) ||
      (id !== "oversize" && approxCm.width <= ref.height && approxCm.height <= ref.width)
    )
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
