/**
 * SCP Screen Print rate card (AUD major units, inc GST) — shared by the
 * customizer pricing panel, cart pricing, and the backend recompute.
 *
 * 2026-08 repricing: bands mirror the supplier's (DSP price list 1 Mar 2024)
 * with a tapering margin (1.45 → 1.25). The supplier does the entire print
 * run; SC Prints' costs are handling + coordination, so margins are pure
 * contribution. Setup is charged per SCREEN (one screen per colour per
 * position) as a separate cart line — see NEXT_PUBLIC_SCREEN_SETUP_VARIANT_ID.
 *
 * Mirror of backend canonical version — keep in sync with:
 * {@link backend/src/lib/scp-screen-print-pricing.ts}
 * Validated by `scripts/check-screen-pricing-sync.mjs` (`pnpm check-sync`).
 */

export const SCP_SCREEN_PRICING_VERSION = 1 as const

export const SCREEN_MIN_QUANTITY = 25
export const SCREEN_MAX_QUANTITY = 999
export const SCREEN_MAX_COLOURS = 6
/** Per screen (one colour × one position), inc GST — separate cart line. */
export const SCREEN_SETUP_PER_SCREEN_MAJOR = 99
export const SCREEN_REPEAT_SETUP_PER_SCREEN_MAJOR = 39
/** Hoodies / sweats / fleece / poly — per print, flagged per product via metadata.screen_heavy. */
export const SCREEN_HEAVY_GARMENT_SURCHARGE_MAJOR = 1

export type ScreenQuantityTier = {
  label: string
  minQuantity: number
  maxQuantity: number
  /** Per-piece price for 1..6 colours, inc GST. */
  prices: readonly [number, number, number, number, number, number]
}

export const SCP_SCREEN_QUANTITY_TIERS: ScreenQuantityTier[] = [
  { label: "25–49", minQuantity: 25, maxQuantity: 49, prices: [8.6, 10.5, 12.45, 14.35, 16.25, 18.35] },
  { label: "50–99", minQuantity: 50, maxQuantity: 99, prices: [5.15, 5.7, 6.55, 7.4, 8.3, 9.25] },
  { label: "100–199", minQuantity: 100, maxQuantity: 199, prices: [4.0, 4.7, 5.1, 5.5, 5.95, 6.6] },
  { label: "200–499", minQuantity: 200, maxQuantity: 499, prices: [3.2, 3.65, 3.95, 4.15, 4.35, 4.5] },
  { label: "500–999", minQuantity: 500, maxQuantity: 999, prices: [2.15, 2.35, 2.55, 2.75, 2.9, 3.0] },
]

/**
 * Below-minimum quantities price at the 25–49 tier (the add-to-cart gate
 * rejects them separately); above 999 clamps to the top tier (quote flow
 * should intercept first).
 */
export function resolveScreenTierIndexForQuantity(quantity: number): number {
  const safe = Math.max(1, Math.floor(quantity || 1))
  const idx = SCP_SCREEN_QUANTITY_TIERS.findIndex(
    (t) => safe >= t.minQuantity && safe <= t.maxQuantity
  )
  if (idx >= 0) return idx
  return safe < SCREEN_MIN_QUANTITY ? 0 : SCP_SCREEN_QUANTITY_TIERS.length - 1
}

const round2 = (n: number) => Math.round(n * 100) / 100

export type ScreenUnitInput = {
  quantity: number
  /** Design colours 1..6 (before underbase). */
  colours: number
  /** Dark garment adds a white underbase screen (counts toward the 6 max). */
  darkGarment?: boolean
  /** Product-level metadata.screen_heavy — hoodies/fleece/poly. */
  heavyGarment?: boolean
}

export function screenUnitMajor(input: ScreenUnitInput): {
  unitMajor: number
  effectiveColours: number
  tierIndex: number
  tierLabel: string
} {
  const requested = Math.max(1, Math.min(SCREEN_MAX_COLOURS, Math.round(input.colours || 1)))
  const effectiveColours = Math.min(
    SCREEN_MAX_COLOURS,
    requested + (input.darkGarment ? 1 : 0)
  )
  const tierIndex = resolveScreenTierIndexForQuantity(input.quantity)
  const tier = SCP_SCREEN_QUANTITY_TIERS[tierIndex]
  const unitMajor = round2(
    tier.prices[effectiveColours - 1] +
      (input.heavyGarment ? SCREEN_HEAVY_GARMENT_SURCHARGE_MAJOR : 0)
  )
  return { unitMajor, effectiveColours, tierIndex, tierLabel: tier.label }
}
