import { HttpTypes } from "@medusajs/types"

export type TotalsMutableForDisplay = {
  items?: unknown[] | null
  subtotal?: number | null
  tax_total?: number | null
  discount_total?: number | null
  total?: number | null
}

/**
 * No-op. Storefront now displays Medusa's totals directly so cart, checkout, order confirmation,
 * and admin all agree byte-for-byte (and Stripe charges what the customer was shown).
 *
 * The previous implementation rewrote subtotal/tax/total based on `bulk_pricing` metadata, which
 * caused the storefront to undercount vs Medusa's authoritative `unit_price`. That created a chargeback
 * risk: customer saw $X, card was charged Y. If quantity-band pricing is wrong it must be fixed in the
 * Medusa price set (admin → product → prices), never overridden in the UI.
 */
export function applyDisplayPriceCorrection(_subject: TotalsMutableForDisplay) {
  return
}

export function applyDisplayPriceCorrectionToCart(_cart: HttpTypes.StoreCart) {
  return
}

export function applyDisplayPriceCorrectionToOrder(_order: HttpTypes.StoreOrder) {
  return
}
