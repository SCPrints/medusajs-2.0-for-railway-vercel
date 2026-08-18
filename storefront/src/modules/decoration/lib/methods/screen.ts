import { splitGst } from "../gst"
import type { Breakdown, RushTier } from "../types"

// Single source of truth: the shared screen rate card (mirrored to the
// backend and validated by check-screen-pricing-sync). This file re-exports
// under its legacy names so the estimator + chatbot imports stay stable.
import {
  SCP_SCREEN_QUANTITY_TIERS,
  SCREEN_HEAVY_GARMENT_SURCHARGE_MAJOR,
  SCREEN_MAX_COLOURS,
  SCREEN_MAX_QUANTITY,
  SCREEN_MIN_QUANTITY,
  SCREEN_REPEAT_SETUP_PER_SCREEN_MAJOR,
  SCREEN_SETUP_PER_SCREEN_MAJOR,
  type ScreenQuantityTier,
} from "@modules/customizer/lib/scp-screen-print-pricing"

export { SCREEN_MAX_COLOURS, SCREEN_MIN_QUANTITY }
export type { ScreenQuantityTier }
export const SCREEN_PER_SCREEN_FEE = SCREEN_SETUP_PER_SCREEN_MAJOR
export const SCREEN_REPEAT_SCREEN_FEE = SCREEN_REPEAT_SETUP_PER_SCREEN_MAJOR
export const SCREEN_HEAVY_GARMENT_SURCHARGE = SCREEN_HEAVY_GARMENT_SURCHARGE_MAJOR
export const SCREEN_QUANTITY_TIERS = SCP_SCREEN_QUANTITY_TIERS
export const SCREEN_OVER_MAX_QUANTITY = SCREEN_MAX_QUANTITY
/** Rush (priority) = 30% of decoration + setup, mirroring the supplier's rush terms. */
export const SCREEN_RUSH_RATE = 0.3

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
