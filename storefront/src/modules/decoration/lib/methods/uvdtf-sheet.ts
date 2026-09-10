import { splitGst } from "../gst"
import { getRushSurcharge } from "../rush"
import type { Breakdown, RushTier } from "../types"

export const UVDTF_SHEET_WIDTH_MM = 580
export const UVDTF_SHEET_SETUP_FEE = 25
export const UVDTF_SHEET_MIN_METRES = 1

/**
 * Per-lineal-metre rate (inc GST) by total length, longest band first.
 * Source: "UV DTF" sheet of SC-Prints-Cost-Model.xlsx (Card 2, 2026-09-03) —
 * cost floor ~$31/lm ex at 40 lm/month, positioned above the online sheet
 * farms ($35-60/m) and under what ServiceM8 shows we invoiced ($82-88/m).
 */
export const UVDTF_SHEET_RATE_BANDS = [
  { minMetres: 25, label: "25+ m", perMetre: 45 },
  { minMetres: 10, label: "10–24 m", perMetre: 48 },
  { minMetres: 5, label: "5–9 m", perMetre: 52 },
  { minMetres: 2, label: "2–4 m", perMetre: 58 },
  { minMetres: 1, label: "1 m", perMetre: 65 },
] as const

export const uvdtfSheetRate = (metres: number): number =>
  UVDTF_SHEET_RATE_BANDS.find((b) => metres >= b.minMetres)?.perMetre ??
  UVDTF_SHEET_RATE_BANDS[UVDTF_SHEET_RATE_BANDS.length - 1].perMetre

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
  const unitPrice = uvdtfSheetRate(wholeMetres)
  const decorationSubtotal = round2(wholeMetres * unitPrice)
  const setupTotal = reorder ? 0 : UVDTF_SHEET_SETUP_FEE
  const rushSurcharge = getRushSurcharge("uvdtf_sheet", rushTier)
  const subtotalExGst = round2(decorationSubtotal + setupTotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  const notes = [
    `Sheets are ${UVDTF_SHEET_WIDTH_MM}mm wide. Whole metres only — per-metre rate drops at 2, 5, 10 and 25 m.`,
    `$${UVDTF_SHEET_SETUP_FEE} setup fee${reorder ? " (waived on reorders)" : ""}.`,
  ]

  return {
    method: "uvdtf_sheet",
    unitPrice,
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
