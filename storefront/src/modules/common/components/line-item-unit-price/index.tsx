import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"

import {
  cartLineUsesExplicitUnitPrice,
  getPricesForCartLineVariant,
  resolveCartLineDisplayUnitMinor,
  variantWithInferredHandleForLineItem,
} from "@lib/util/cart-line-display-unit"
import { convertToLocale } from "@lib/util/money"

type LineItemUnitPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
}

const LineItemUnitPrice = ({
  item,
  style = "default",
}: LineItemUnitPriceProps) => {
  const variantForPricing = variantWithInferredHandleForLineItem(item)
  const prices = getPricesForCartLineVariant(variantForPricing)
  const currency_code = prices?.currency_code ?? "usd"

  const unitAmount = resolveCartLineDisplayUnitMinor(item, variantForPricing)
  const itemRec = item as { compare_at_unit_price?: number | null }

  let calculated_price: string
  let original_price: string | undefined
  let original_price_number: number
  let percentage_diff: string | undefined
  let hasReducedPrice: boolean

  if (cartLineUsesExplicitUnitPrice(item)) {
    calculated_price = convertToLocale({
      amount: unitAmount,
      currency_code,
    })

    const compareAt =
      typeof itemRec.compare_at_unit_price === "number" &&
      Number.isFinite(itemRec.compare_at_unit_price)
        ? itemRec.compare_at_unit_price
        : null

    if (compareAt != null && compareAt > unitAmount) {
      original_price_number = compareAt
      original_price = convertToLocale({
        amount: compareAt,
        currency_code,
      })
      const pct = Math.round((1 - unitAmount / compareAt) * 100)
      percentage_diff = `${pct}`
      hasReducedPrice = true
    } else {
      original_price_number = unitAmount
      original_price = calculated_price
      percentage_diff = undefined
      hasReducedPrice = false
    }
  } else {
    calculated_price = prices?.calculated_price ?? ""
    original_price = prices?.original_price
    original_price_number = prices?.original_price_number ?? 0
    percentage_diff = prices?.percentage_diff
    hasReducedPrice = unitAmount < (original_price_number ?? 0)
  }

  return (
    <div className="flex flex-col text-ui-fg-muted justify-center h-full">
      {hasReducedPrice && (
        <>
          <p>
            {style === "default" && (
              <span className="text-ui-fg-muted">Original: </span>
            )}
            <span
              className="line-through"
              data-testid="product-unit-original-price"
            >
              {original_price}
            </span>
          </p>
          {style === "default" && percentage_diff ? (
            <span className="text-ui-fg-interactive">-{percentage_diff}%</span>
          ) : null}
        </>
      )}
      <span
        className={clx("text-base-regular", {
          "text-ui-fg-interactive": hasReducedPrice,
        })}
        data-testid="product-unit-price"
      >
        {calculated_price}
      </span>
    </div>
  )
}

export default LineItemUnitPrice
