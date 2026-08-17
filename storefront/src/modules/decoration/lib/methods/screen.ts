import { splitGst } from "../gst"
import type { Breakdown, RushTier } from "../types"

export const SCREEN_MIN_QUANTITY = 25
export const SCREEN_MAX_COLOURS = 6
export const SCREEN_PER_SCREEN_FEE = 99
export const SCREEN_REPEAT_SCREEN_FEE = 39
export const SCREEN_HEAVY_GARMENT_SURCHARGE = 1
/** Rush (priority) = 30% of decoration + setup, mirroring the supplier's rush terms. */
export const SCREEN_RUSH_RATE = 0.3

export type ScreenQuantityTier = {
  label: string
  minQuantity: number
  maxQuantity: number
  /** Per-piece price for 1..6 colours. */
  prices: [number, number, number, number, number, number]
}

/**
 * 2026-08 repricing: bands mirror the supplier's (DSP 1 Mar 2024 list) with a
 * tapering margin. Rows beyond 999 are intentionally omitted — quote manually.
 */
export const SCREEN_QUANTITY_TIERS: ScreenQuantityTier[] = [
  { label: "25–49", minQuantity: 25, maxQuantity: 49, prices: [8.6, 10.5, 12.45, 14.35, 16.25, 18.35] },
  { label: "50–99", minQuantity: 50, maxQuantity: 99, prices: [5.15, 5.7, 6.55, 7.4, 8.3, 9.25] },
  { label: "100–199", minQuantity: 100, maxQuantity: 199, prices: [4.0, 4.7, 5.1, 5.5, 5.95, 6.6] },
  { label: "200–499", minQuantity: 200, maxQuantity: 499, prices: [3.2, 3.65, 3.95, 4.15, 4.35, 4.5] },
  { label: "500–999", minQuantity: 500, maxQuantity: 999, prices: [2.15, 2.35, 2.55, 2.75, 2.9, 3.0] },
]

export const SCREEN_OVER_MAX_QUANTITY = 999

export type ScreenInput = {
  /** 1–6, dark-garment auto-bumps via `darkGarment` flag. */
  colours: number
  darkGarment?: boolean
  /** Hoodies / sweats / fleece / polyester — per-print surcharge. */
  heavyGarment?: boolean
  quantity: number
  rushTier?: RushTier
  /** Repeat of a design run within the last 6 months — reduced setup. */
  reorder?: boolean
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
  heavyGarment = false,
  quantity,
  rushTier = "standard",
  reorder = false,
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
    unitPrice = round2(
      tier.prices[effectiveColours - 1] +
        (heavyGarment ? SCREEN_HEAVY_GARMENT_SURCHARGE : 0)
    )
  }

  const screenFee = reorder ? SCREEN_REPEAT_SCREEN_FEE : SCREEN_PER_SCREEN_FEE
  const decorationSubtotal = round2(unitPrice * safeQty)
  const setupTotal = round2(screenFee * effectiveColours)
  // Screen rush is percentage-based (the print run is outsourced and the
  // supplier charges +30% of the order) — flat getRushSurcharge doesn't apply.
  const rushSurcharge =
    rushTier === "priority"
      ? round2((decorationSubtotal + setupTotal) * SCREEN_RUSH_RATE)
      : 0
  const subtotalExGst = round2(decorationSubtotal + setupTotal + rushSurcharge)
  const { exGst, gst, incGst } = splitGst(subtotalExGst)

  const notes: string[] = []
  notes.push(
    `${effectiveColours} screens × $${screenFee} setup${
      reorder
        ? " (repeat rate — same design within 6 months)"
        : ` ($${SCREEN_REPEAT_SCREEN_FEE}/screen when repeating the same design within 6 months)`
    }.`
  )
  if (heavyGarment)
    notes.push(
      `Hoodies / fleece / poly: +$${SCREEN_HEAVY_GARMENT_SURCHARGE.toFixed(2)} per print applied.`
    )
  if (darkGarment) notes.push("Dark garment: underbase counted as one of your colour slots.")
  if (rushTier === "priority") notes.push("Priority turnaround: +30% of print + setup.")
  if (belowMin) notes.push(`Below ${SCREEN_MIN_QUANTITY}-piece minimum — request a manual quote.`)
  if (overMax) notes.push(`Above ${SCREEN_OVER_MAX_QUANTITY} pieces — request a manual quote for volume pricing.`)

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
