/**
 * Shared money formatter for report charts and admin pages.
 * Whole dollars, en-AU. Falls back to a plain `$` string if the
 * currency code is garbage.
 */
export const formatCurrency = (n: number, currency: string = "AUD"): string => {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency.toUpperCase() || "AUD",
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `$${Math.round(n)}`
  }
}
