import type { AccountQuoteLine, AccountQuoteStatus } from "@lib/data/quotes-account"

/** Pure display helpers for the account quote pages — unit-tested. */

export const STATUS_TONE: Record<AccountQuoteStatus, string> = {
  cart: "bg-gray-100 text-gray-700 border-gray-200",
  waiting: "bg-amber-50 text-amber-800 border-amber-200",
  ready: "bg-emerald-50 text-emerald-800 border-emerald-200",
  accepted: "bg-sky-50 text-sky-800 border-sky-200",
  expired: "bg-gray-100 text-gray-600 border-gray-200",
  closed: "bg-gray-100 text-gray-600 border-gray-200",
}

/** One plain sentence under the status, so the customer knows what happens next. */
export const STATUS_HELP: Record<AccountQuoteStatus, string> = {
  cart: "You downloaded this quote from your cart. To go ahead, check out your cart.",
  waiting: "We're working on this quote. We'll email you when it's ready.",
  ready: "Your quote is ready. Accept it to place the order.",
  accepted: "You accepted this quote. It's now an order.",
  expired: "This quote has run out. Ask us and we'll send a fresh one.",
  closed: "This quote is closed.",
}

export const money = (amount: number, currency = "aud") =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(amount)

export const shortDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" }) : ""

/** "$20.00" or "$20.00 – $23.00" when sizes differ in price; "" when not priced yet. */
export function unitPriceLabel(line: Pick<AccountQuoteLine, "unit_price" | "unit_price_max">, currency = "aud"): string {
  if (line.unit_price == null) return ""
  return line.unit_price_max != null && line.unit_price_max > line.unit_price
    ? `${money(line.unit_price, currency)} – ${money(line.unit_price_max, currency)}`
    : money(line.unit_price, currency)
}

/** "Valid until 19 Dec 2026" for a quote that can still be accepted, else "". */
export function validityLabel(status: AccountQuoteStatus, expiresAt: string | null): string {
  if (!expiresAt) return ""
  if (status === "ready" || status === "cart") return `Valid until ${shortDate(expiresAt)}`
  if (status === "expired") return `Ran out ${shortDate(expiresAt)}`
  return ""
}
