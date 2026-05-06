import { splitGst } from "../gst"
import { getRushSurcharge } from "../rush"
import type { Breakdown, RushTier } from "../types"

export const UVDTF_SHEET_WIDTH_MM = 580
export const UVDTF_SHEET_PER_METRE = 25
export const UVDTF_SHEET_SETUP_FEE = 25
export const UVDTF_SHEET_MIN_METRES = 1

export type UvdtfSheetInput = {
  /** Whole metres only. Anything below 1 is clamped to the minimum. */
  metres: number
  rushTier?: RushTier
  reorder?: boolean
}

export const calculateUvdtfSheetPrice = ({
  metres,
  rushTier = "standard",
  reorder = false,
}: UvdtfSheetInput): Breakdown => {
  const wholeMetres = Math.max(UVDTF_SHEET_MIN_METRES, Math.floor(metres))
  const decorationSubtotal = round2(wholeMetres * UVDTF_SHEET_PER_METRE)
  const setupTotal = reorder ? 0 : UVDTF_SHEET_SETUP_FEE
  const rushSurcharge = getRushSurcharge("uvdtf_sheet", rushTier)
  const subtotalExGst = round2(decorationSubtotal + setupTotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  const notes = [
    `Sheets are ${UVDTF_SHEET_WIDTH_MM}mm wide. Whole metres only.`,
    `$${UVDTF_SHEET_SETUP_FEE} setup fee${reorder ? " (waived on reorders)" : ""}.`,
  ]

  return {
    method: "uvdtf_sheet",
    unitPrice: UVDTF_SHEET_PER_METRE,
    quantity: wholeMetres,
    decorationSubtotal,
    setupTotal,
    rushSurcharge,
    subtotalExGst: exGst,
    gst,
    totalIncGst: incGst,
    belowMinimum: wholeMetres < UVDTF_SHEET_MIN_METRES,
    rushTier,
    notes,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
