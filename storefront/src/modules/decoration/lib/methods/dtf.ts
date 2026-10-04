import {
  resolveScpTierIndexForQuantity,
  scpPrintUnitMajorForTier,
  SCP_PRINT_SIZE_OPTIONS,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"
import { splitGst } from "../gst"
import { getRushSurcharge } from "../rush"
import type { Breakdown, RushTier } from "../types"

// No minimum and no separate artwork setup on website DTF orders — setup is
// rolled into the per-print price (matches the product-page card). The $25
// setup only exists on manual quotes outside the site.

export const DTF_SIZE_OPTIONS = SCP_PRINT_SIZE_OPTIONS

export type DtfInput = {
  sizeId: ScpPrintSizeId
  quantity: number
  rushTier?: RushTier
}

export const calculateDtfPrice = ({
  sizeId,
  quantity,
  rushTier = "standard",
}: DtfInput): Breakdown => {
  const safeQty = Math.max(1, Math.round(quantity))
  const tierIndex = resolveScpTierIndexForQuantity(safeQty)
  const unitPrice = scpPrintUnitMajorForTier(sizeId, tierIndex)
  const decorationSubtotal = round2(unitPrice * safeQty)

  const rushSurcharge = getRushSurcharge("dtf", rushTier)
  const subtotalExGst = round2(decorationSubtotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  return {
    method: "dtf",
    unitPrice,
    quantity: safeQty,
    decorationSubtotal,
    setupTotal: 0,
    rushSurcharge,
    subtotalExGst: exGst,
    gst,
    totalIncGst: incGst,
    belowMinimum: false,
    rushTier,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
