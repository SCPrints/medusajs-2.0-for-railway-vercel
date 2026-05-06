import {
  resolveScpTierIndexForQuantity,
  scpPrintUnitMajorForTier,
  SCP_PRINT_SIZE_OPTIONS,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"
import { splitGst } from "../gst"
import { getRushSurcharge } from "../rush"
import { reorderableSetup } from "../setup"
import type { Breakdown, RushTier } from "../types"

export const DTF_MIN_QUANTITY = 10
export const DTF_UNDER_MIN_FEE = 20
export const DTF_ARTWORK_SETUP_FEE = 25

export const DTF_SIZE_OPTIONS = SCP_PRINT_SIZE_OPTIONS

export type DtfInput = {
  sizeId: ScpPrintSizeId
  quantity: number
  rushTier?: RushTier
  reorder?: boolean
}

export const calculateDtfPrice = ({
  sizeId,
  quantity,
  rushTier = "standard",
  reorder = false,
}: DtfInput): Breakdown => {
  const safeQty = Math.max(1, Math.round(quantity))
  const tierIndex = resolveScpTierIndexForQuantity(safeQty)
  const unitPrice = scpPrintUnitMajorForTier(sizeId, tierIndex)
  const decorationSubtotal = round2(unitPrice * safeQty)

  const artworkSetup = reorderableSetup(DTF_ARTWORK_SETUP_FEE, reorder)
  const underMinFee = safeQty < DTF_MIN_QUANTITY ? DTF_UNDER_MIN_FEE : 0
  const setupTotal = round2(artworkSetup + underMinFee)

  const rushSurcharge = getRushSurcharge("dtf", rushTier)
  const subtotalExGst = round2(decorationSubtotal + setupTotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  const notes: string[] = []
  if (underMinFee > 0) notes.push(`Under-minimum fee of $${DTF_UNDER_MIN_FEE} applied (min ${DTF_MIN_QUANTITY}).`)
  if (artworkSetup > 0) notes.push(`$${DTF_ARTWORK_SETUP_FEE} artwork setup (waived on reorders).`)

  return {
    method: "dtf",
    unitPrice,
    quantity: safeQty,
    decorationSubtotal,
    setupTotal,
    rushSurcharge,
    subtotalExGst: exGst,
    gst,
    totalIncGst: incGst,
    belowMinimum: safeQty < DTF_MIN_QUANTITY,
    rushTier,
    notes: notes.length ? notes : undefined,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
