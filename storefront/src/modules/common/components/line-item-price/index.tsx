import { clx } from "@medusajs/ui"

import { getPercentageDiff } from "@lib/util/get-precentage-diff"
import { getPricesForVariant } from "@lib/util/get-product-price"
import { convertMinorToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type LineItemPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
}

const LineItemPrice = ({ item, style = "default" }: LineItemPriceProps) => {
  // Medusa cart variant may have a partial `.product` without handle, which would
  // defeat the AS Colour AUD hundredfold fix. Pull handle from common fallbacks.
  const itemRecord = item as unknown as {
    variant?: Record<string, unknown> & {
      product?: { handle?: string }
      metadata?: Record<string, unknown>
    }
    product_handle?: string
    metadata?: Record<string, unknown>
  }
  const inferredHandle =
    (typeof itemRecord.variant?.product?.handle === "string" &&
      itemRecord.variant.product.handle) ||
    (typeof itemRecord.product_handle === "string" && itemRecord.product_handle) ||
    (typeof itemRecord.metadata?.product_handle === "string" &&
      (itemRecord.metadata.product_handle as string)) ||
    undefined
  const variantForPricing = inferredHandle
    ? {
        ...(item.variant as unknown as Record<string, unknown>),
        product: {
          ...(itemRecord.variant?.product ?? {}),
          handle: inferredHandle,
        },
      }
    : item.variant
  const { currency_code, original_price_number, display_unit_minor, calculated_price_number } =
    getPricesForVariant(variantForPricing) ?? {}

  const adjustmentsSum = (item.adjustments || []).reduce(
    (acc, adjustment) => adjustment.amount + acc,
    0
  )

  const unitMinor =
    typeof display_unit_minor === "number" && Number.isFinite(display_unit_minor)
      ? display_unit_minor
      : (calculated_price_number ?? 0)

  const originalPrice = original_price_number * item.quantity
  const currentPrice = unitMinor * item.quantity - adjustmentsSum
  const hasReducedPrice = currentPrice < originalPrice

  return (
    <div className="flex flex-col gap-x-2 text-ui-fg-subtle items-end">
      <div className="text-left">
        {hasReducedPrice && (
          <>
            <p>
              {style === "default" && (
                <span className="text-ui-fg-subtle">Original: </span>
              )}
              <span
                className="line-through text-ui-fg-muted"
                data-testid="product-original-price"
              >
                {convertMinorToLocale({
                  amount: originalPrice,
                  currency_code,
                })}
              </span>
            </p>
            {style === "default" && (
              <span className="text-ui-fg-interactive">
                -{getPercentageDiff(originalPrice, currentPrice || 0)}%
              </span>
            )}
          </>
        )}
        <span
          className={clx("text-base-regular", {
            "text-ui-fg-interactive": hasReducedPrice,
          })}
          data-testid="product-price"
        >
          {convertMinorToLocale({
            amount: currentPrice,
            currency_code,
          })}
        </span>
      </div>
    </div>
  )
}

export default LineItemPrice
