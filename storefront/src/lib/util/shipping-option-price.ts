import type { HttpTypes } from "@medusajs/types"

import { convertMinorToLocale } from "./money"

function normalizeDisplayAmount(
  rawAmount: number,
  option: HttpTypes.StoreCartShippingOption
): number {
  if (!Number.isFinite(rawAmount)) {
    return rawAmount
  }

  // Some Medusa setups return shipping option amounts in minor units (e.g. 1500 cents)
  // while storefront money formatting here expects major units (e.g. 15 dollars).
  // Convert only clearly "cent-like" values to avoid touching normal major amounts.
  if (rawAmount >= 1000 && rawAmount % 100 === 0) {
    return rawAmount / 100
  }

  const cc = option.currency_code?.toLowerCase()
  const matchingPrice = option.prices?.find(
    (price) => price?.currency_code?.toLowerCase() === cc
  )
  const matchingAmount = matchingPrice?.amount
  if (
    typeof matchingAmount === "number" &&
    Number.isFinite(matchingAmount) &&
    rawAmount === matchingAmount * 100
  ) {
    return matchingAmount
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
    const calculated = option.calculated_price?.calculated_amount
    // Some carts surface `calculated_amount` as 100x the flat `amount`.
    // Prefer explicit flat amount when both exist and diverge by 100x.
    if (
      typeof calculated === "number" &&
      Number.isFinite(calculated) &&
      calculated >= top * 100 &&
      calculated % 100 === 0
    ) {
      return normalizeDisplayAmount(top, option)
    }
    return normalizeDisplayAmount(top, option)
  }

  const calculated = option.calculated_price?.calculated_amount
  if (typeof calculated === "number" && Number.isFinite(calculated)) {
    return normalizeDisplayAmount(calculated, option)
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
      return normalizeDisplayAmount(a, option)
    }
  }

  const first = prices[0]?.amount
  if (typeof first === "number" && Number.isFinite(first)) {
    return normalizeDisplayAmount(first, option)
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
