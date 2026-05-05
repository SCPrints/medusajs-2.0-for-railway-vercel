import type { HttpTypes } from "@medusajs/types"

import { convertMinorToLocale } from "./money"

function normalizeShippingAmountForDisplay(rawAmount: number): number {
  if (!Number.isFinite(rawAmount)) {
    return rawAmount
  }

  // Shipping option payloads can surface in minor units (cents). Storefront display
  // formatters in this repo expect major units, so normalize obvious cent values.
  // Examples:
  //   1500 -> 15.00
  //   1000 -> 10.00
  if (rawAmount >= 1000 && rawAmount % 100 === 0) {
    return rawAmount / 100
  }

  return rawAmount
}

/**
 * Resolves a shipping option amount and normalizes for storefront display.
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
    return normalizeShippingAmountForDisplay(top)
  }

  const calculated = option.calculated_price?.calculated_amount
  if (typeof calculated === "number" && Number.isFinite(calculated)) {
    return normalizeShippingAmountForDisplay(calculated)
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
      return normalizeShippingAmountForDisplay(a)
    }
  }

  const first = prices[0]?.amount
  if (typeof first === "number" && Number.isFinite(first)) {
    return normalizeShippingAmountForDisplay(first)
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
