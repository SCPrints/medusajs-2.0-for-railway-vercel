/**
 * Worked-example maths for the screen printing cost guide. Everything is
 * derived from the live rate cards so the article can't drift from what the
 * customizer actually charges when a price band changes.
 */
import {
  resolveScpTierIndexForQuantity,
  scpPrintUnitMajorForTier,
  type ScpPrintSizeId,
} from "@modules/customizer/lib/scp-dtf-print-pricing"
import {
  SCREEN_MAX_QUANTITY,
  SCREEN_MIN_QUANTITY,
  SCREEN_SETUP_PER_SCREEN_MAJOR,
  screenUnitMajor,
} from "@modules/customizer/lib/scp-screen-print-pricing"

const round2 = (n: number) => Math.round(n * 100) / 100

export type ScreenJob = {
  quantity: number
  /** Design colours, before any underbase. */
  colours: number
  darkGarment?: boolean
}

/** One print position, standard garment, first-time setup. Excludes the garment. */
export function screenJobCost(job: ScreenJob) {
  const { unitMajor, effectiveColours } = screenUnitMajor(job)
  const setup = effectiveColours * SCREEN_SETUP_PER_SCREEN_MAJOR
  const prints = round2(unitMajor * job.quantity)
  const total = round2(prints + setup)
  return {
    screens: effectiveColours,
    unit: unitMajor,
    setup,
    prints,
    total,
    perGarment: round2(total / job.quantity),
  }
}

/** One DTF print position at the product-page rate. Excludes the garment. */
export function dtfJobCost(quantity: number, sizeId: ScpPrintSizeId) {
  const unit = scpPrintUnitMajorForTier(
    sizeId,
    resolveScpTierIndexForQuantity(quantity)
  )
  return { unit, total: round2(unit * quantity) }
}

/**
 * Smallest quantity at which screen printing (setup included) costs less than
 * DTF for the same single print position. null = DTF stays cheaper all the way
 * to the top of the screen card.
 */
export function screenBreakEvenQuantity(
  design: Omit<ScreenJob, "quantity">,
  dtfSizeId: ScpPrintSizeId
): number | null {
  for (let q = SCREEN_MIN_QUANTITY; q <= SCREEN_MAX_QUANTITY; q++) {
    if (screenJobCost({ ...design, quantity: q }).total < dtfJobCost(q, dtfSizeId).total) {
      return q
    }
  }
  return null
}
