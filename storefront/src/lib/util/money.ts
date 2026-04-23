import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

/**
 * `amount` is in major units (dollars for AUD) — the value `Intl` expects for `style: "currency"`.
 * Prefer `convertMinorToLocale` for any money coming from the Medusa store API, which uses minor units.
 */
export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
}: ConvertToLocaleParams) => {
  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString()
}

/** Medusa (cart, order, product `calculated_price`, `bulk_pricing` tier amounts) uses minor units (e.g. cents). */
export const convertMinorToLocale = (params: ConvertToLocaleParams) =>
  convertToLocale({ ...params, amount: params.amount / 100 })

export const minorToMajor = (amountMinor: number) => amountMinor / 100
