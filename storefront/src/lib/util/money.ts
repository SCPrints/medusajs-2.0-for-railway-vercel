import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

const CURRENCY_LOCALE_MAP: Record<string, string> = {
  aud: "en-AU",
  nzd: "en-NZ",
  gbp: "en-GB",
  eur: "en-IE",
}

const localeForCurrency = (currency_code: string | undefined): string =>
  CURRENCY_LOCALE_MAP[(currency_code ?? "").toLowerCase()] ?? "en-US"

/**
 * `amount` is in major units (dollars for AUD) — what Medusa stores as `price.amount` and what `Intl`
 * expects for `style: "currency"`. Locale is derived from `currency_code` when omitted.
 */
export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
  locale,
}: ConvertToLocaleParams) => {
  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale ?? localeForCurrency(currency_code), {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString()
}

/**
 * Backwards-compatible alias kept for any callers still importing this name.
 * Medusa now stores `price.amount` in major units, so this is a pass-through to `convertToLocale`.
 */
export const convertMinorToLocale = convertToLocale
