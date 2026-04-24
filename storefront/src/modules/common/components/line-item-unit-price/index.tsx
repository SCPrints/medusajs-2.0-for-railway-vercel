import { getPricesForVariant } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"

type LineItemUnitPriceProps = {
  item: HttpTypes.StoreCartLineItem | HttpTypes.StoreOrderLineItem
  style?: "default" | "tight"
}

const LineItemUnitPrice = ({
  item,
  style = "default",
}: LineItemUnitPriceProps) => {
  // See LineItemPrice — Medusa cart variants may lack `.product.handle`, so we
  // infer it from common item fields to let the finalizer apply.
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
  const {
    original_price,
    calculated_price,
    original_price_number,
    calculated_price_number,
    display_unit_minor,
    percentage_diff,
  } = getPricesForVariant(variantForPricing) ?? {}
  const unitMinor =
    typeof display_unit_minor === "number" && Number.isFinite(display_unit_minor)
      ? display_unit_minor
      : (calculated_price_number ?? 0)
  const hasReducedPrice = unitMinor < (original_price_number ?? 0)

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
          {style === "default" && (
            <span className="text-ui-fg-interactive">-{percentage_diff}%</span>
          )}
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
