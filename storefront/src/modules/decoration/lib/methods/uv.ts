import { splitGst } from "../gst"
import type { Breakdown } from "../types"

export const UV_STATUS_MESSAGE =
  "UV printing pricing is still being finalised — please request a manual quote."

/** Placeholder result so the unified estimator can render a UV tab without crashing. */
export const calculateUvPrice = (): Breakdown => {
  const { exGst, gst, incGst } = splitGst(0)
  return {
    method: "uv",
    unitPrice: 0,
    quantity: 0,
    decorationSubtotal: 0,
    setupTotal: 0,
    rushSurcharge: 0,
    subtotalExGst: exGst,
    gst,
    totalIncGst: incGst,
    belowMinimum: true,
    rushTier: "standard",
    notes: [UV_STATUS_MESSAGE],
  }
}
