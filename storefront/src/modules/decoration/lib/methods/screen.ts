import { splitGst } from "../gst"
import { getRushSurcharge } from "../rush"
import type { Breakdown, RushTier } from "../types"

export const SCREEN_MIN_QUANTITY = 50
export const SCREEN_MAX_COLOURS = 6
export const SCREEN_PER_SCREEN_FEE = 50

export type ScreenQuantityTier = {
  label: string
  minQuantity: number
  maxQuantity: number
  /** Per-piece price for 1..6 colours. */
  prices: [number, number, number, number, number, number]
}

/**
 * Quantity bands capped at 251–500 per business decision (rows beyond 500 are
 * intentionally omitted — quote manually for those).
 */
export const SCREEN_QUANTITY_TIERS: ScreenQuantityTier[] = [
  { label: "50–74", minQuantity: 50, maxQuantity: 74, prices: [5.0, 5.5, 6.4, 7.9, 8.4, 8.9] },
  { label: "75–125", minQuantity: 75, maxQuantity: 125, prices: [3.9, 4.1, 4.6, 5.3, 5.85, 6.5] },
  { label: "126–250", minQuantity: 126, maxQuantity: 250, prices: [2.85, 3.25, 3.7, 4.1, 4.6, 5.1] },
  { label: "251–500", minQuantity: 251, maxQuantity: 500, prices: [2.05, 2.3, 2.6, 2.9, 3.9, 4.0] },
]

export const SCREEN_OVER_MAX_QUANTITY = 500

export type ScreenInput = {
  /** 1–6, dark-garment auto-bumps via `darkGarment` flag. */
  colours: number
  darkGarment?: boolean
  quantity: number
  rushTier?: RushTier
}

export const findScreenTier = (quantity: number): ScreenQuantityTier | null => {
  return (
    SCREEN_QUANTITY_TIERS.find(
      (tier) => quantity >= tier.minQuantity && quantity <= tier.maxQuantity
    ) ?? null
  )
}

export const calculateScreenPrice = ({
  colours,
  darkGarment = false,
  quantity,
  rushTier = "standard",
}: ScreenInput): Breakdown => {
  const safeQty = Math.max(1, Math.round(quantity))
  const requestedColours = Math.max(1, Math.min(SCREEN_MAX_COLOURS, Math.round(colours)))
  const effectiveColours = Math.min(
    SCREEN_MAX_COLOURS,
    requestedColours + (darkGarment ? 1 : 0)
  )

  const tier = findScreenTier(safeQty)
  const overMax = safeQty > SCREEN_OVER_MAX_QUANTITY
  const belowMin = safeQty < SCREEN_MIN_QUANTITY

  let unitPrice = 0
  if (tier) {
    unitPrice = tier.prices[effectiveColours - 1]
  }

  const decorationSubtotal = round2(unitPrice * safeQty)
  const setupTotal = round2(SCREEN_PER_SCREEN_FEE * effectiveColours)
  const rushSurcharge = getRushSurcharge("screen", rushTier)
  const subtotalExGst = round2(decorationSubtotal + setupTotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  const notes: string[] = []
  notes.push(
    `${effectiveColours} screens × $${SCREEN_PER_SCREEN_FEE} setup (charged every order — we do not keep screens).`
  )
  if (darkGarment) notes.push("Dark garment: underbase counted as one of your colour slots.")
  if (belowMin) notes.push(`Below ${SCREEN_MIN_QUANTITY}-piece minimum — request a manual quote.`)
  if (overMax) notes.push("Above 500 pieces — request a manual quote for volume pricing.")

  return {
    method: "screen",
    unitPrice,
    quantity: safeQty,
    decorationSubtotal,
    setupTotal,
    rushSurcharge,
    subtotalExGst: exGst,
    gst,
    totalIncGst: incGst,
    belowMinimum: belowMin || overMax || !tier,
    rushTier,
    notes,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
