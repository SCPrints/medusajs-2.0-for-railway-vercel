import { splitGst } from "../gst"
import { getRushSurcharge } from "../rush"
import type { Breakdown, RushTier } from "../types"
import { uvdtfSheetRate } from "./uvdtf-sheet"

/** Added on top of the gang-sheet rate: we peel + apply the stickers to the customer's items. */
export const UVDTF_APPLICATION_PER_METRE = 30
export const UVDTF_APPLIED_SETUP_FEE = 30
export const UVDTF_APPLIED_MIN_METRES = 1
export const UVDTF_APPLIED_SHEET_WIDTH_MM = 580

export const UVDTF_APPLIED_SUBSTRATES = [
  { id: "hard_surface", label: "Hard surface (general)" },
  { id: "glass", label: "Glass" },
  { id: "metal", label: "Metal" },
  { id: "wood", label: "Wood" },
  { id: "hard_plastic", label: "Hard plastic" },
] as const

export type UvdtfAppliedSubstrate = (typeof UVDTF_APPLIED_SUBSTRATES)[number]["id"]

export type UvdtfAppliedInput = {
  metres: number
  substrate?: UvdtfAppliedSubstrate
  rushTier?: RushTier
  reorder?: boolean
}

export const uvdtfAppliedRate = (metres: number): number =>
  uvdtfSheetRate(metres) + UVDTF_APPLICATION_PER_METRE

export const calculateUvdtfAppliedPrice = ({
  metres,
  rushTier = "standard",
  reorder = false,
}: UvdtfAppliedInput): Breakdown => {
  const wholeMetres = Math.max(UVDTF_APPLIED_MIN_METRES, Math.floor(metres))
  const unitPrice = uvdtfAppliedRate(wholeMetres)
  const decorationSubtotal = round2(wholeMetres * unitPrice)
  const setupTotal = reorder ? 0 : UVDTF_APPLIED_SETUP_FEE
  const rushSurcharge = getRushSurcharge("uvdtf_applied", rushTier)
  const subtotalExGst = round2(decorationSubtotal + setupTotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  const notes = [
    "Applied to hard surfaces — hard plastics, glass, metal, wood. Whole metres only.",
    `Gang-sheet rate + $${UVDTF_APPLICATION_PER_METRE}/m application. $${UVDTF_APPLIED_SETUP_FEE} setup fee${reorder ? " (waived on reorders)" : ""}.`,
  ]

  return {
    method: "uvdtf_applied",
    unitPrice,
    quantity: wholeMetres,
    decorationSubtotal,
    setupTotal,
    rushSurcharge,
    subtotalExGst: exGst,
    gst,
    totalIncGst: incGst,
    belowMinimum: wholeMetres < UVDTF_APPLIED_MIN_METRES,
    rushTier,
    notes,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
