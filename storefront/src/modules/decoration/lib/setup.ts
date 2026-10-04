/** Helpers for setup-fee logic that's shared across methods. */

/** Spreads a setup fee across the order quantity for an "all-in per piece" display. */
export const amortisedPerPiece = (
  unitPrice: number,
  setupTotal: number,
  quantity: number
): number => {
  if (quantity <= 0) return unitPrice
  return Math.round((unitPrice + setupTotal / quantity) * 100) / 100
}
