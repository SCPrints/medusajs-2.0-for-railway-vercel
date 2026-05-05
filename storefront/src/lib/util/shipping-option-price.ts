import type { HttpTypes } from "@medusajs/types"

import { convertMinorToLocale } from "./money"

/**
 * Resolves a shipping option's amount in minor units (cents) for display.
 * List endpoints may omit `amount` but still set `calculated_price` or `prices`.
 */
export function getStoreCartShippingOptionMinorAmount(
  option: HttpTypes.StoreCartShippingOption | null | undefined,
  cartCurrencyCode?: string | null
): number | null {
  if (!option) {
    return null
  }

  const top = option.amount
  if (typeof top === "number" && Number.isFinite(top)) {
    const calculated = option.calculated_price?.calculated_amount
    // Some carts surface `calculated_amount` as 100x the flat `amount`.
    // Prefer explicit flat amount when both exist and diverge by 100x.
    if (
      typeof calculated === "number" &&
      Number.isFinite(calculated) &&
      calculated >= top * 100 &&
      calculated % 100 === 0
    ) {
      return top
    }
    return top
  }

  const calculated = option.calculated_price?.calculated_amount
  if (typeof calculated === "number" && Number.isFinite(calculated)) {
    return calculated
  }

  const prices = option.prices
  if (!Array.isArray(prices) || prices.length === 0) {
    return null
  }

  const cc = cartCurrencyCode?.toLowerCase()
  if (cc) {
    const match = prices.find(
      (p) => p?.currency_code?.toLowerCase() === cc
    )
    const a = match?.amount
    if (typeof a === "number" && Number.isFinite(a)) {
      return a
    }
  }

  const first = prices[0]?.amount
  if (typeof first === "number" && Number.isFinite(first)) {
    return first
  }

  return null
}

export function formatStoreCartShippingOptionPrice(
  option: HttpTypes.StoreCartShippingOption | null | undefined,
  cartCurrencyCode?: string | null
): string {
  const minor = getStoreCartShippingOptionMinorAmount(option, cartCurrencyCode)
  if (minor === null) {
    return "—"
  }
  return convertMinorToLocale({
    amount: minor,
    currency_code: cartCurrencyCode ?? "",
  })
}
