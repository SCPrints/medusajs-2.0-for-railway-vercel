"use client"

import { convertMinorToLocale } from "@lib/util/money"
import { InformationCircleSolid } from "@medusajs/icons"
import { Tooltip } from "@medusajs/ui"
import React from "react"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    item_subtotal?: number | null
    tax_total?: number | null
    shipping_total?: number | null
    shipping_subtotal?: number | null
    discount_total?: number | null
    gift_card_total?: number | null
    currency_code: string
  }
}

const CartTotals: React.FC<CartTotalsProps> = ({ totals }) => {
  const {
    currency_code,
    total,
    subtotal,
    item_subtotal,
    tax_total,
    shipping_total,
    shipping_subtotal,
    discount_total,
    gift_card_total,
  } = totals

  // ⚠️ Medusa's `subtotal` INCLUDES shipping (subtotal = item_subtotal +
  // shipping_subtotal — see @medusajs/types cart common.d.ts + verified against
  // the live cart). It must NOT back a line labelled "excl. shipping", or the
  // shipping amount gets folded into the subtotal AND shown again on its own
  // line, so Total (= items + shipping) reads as if shipping were dropped.
  // `item_subtotal` is the items-only, ex-tax figure and matches the sum of the
  // visible line items. Fall back to stripping shipping off `subtotal` for any
  // caller that doesn't hydrate `item_subtotal`.
  const itemsSubtotal =
    item_subtotal ?? Math.max(0, (subtotal ?? 0) - (shipping_total ?? 0))

  // Once GST is applied, Medusa's `shipping_total` is tax-INCLUSIVE (e.g. $22 =
  // $20 + $2 GST) while `shipping_subtotal` is ex-tax ($20). The GST is already
  // surfaced on its own line, and the option is labelled "ex GST", so show the
  // ex-tax figure here — otherwise the shipping GST is double-counted and the
  // lines don't sum to Total. Falls back to `shipping_total` pre-GST (identical).
  const shippingExTax = shipping_subtotal ?? shipping_total ?? 0

  const isAud = currency_code?.toLowerCase() === "aud"
  const taxLabel = isAud ? "GST" : "Taxes"
  const subtotalLabel = isAud
    ? "Subtotal (excl. shipping and GST)"
    : "Subtotal (excl. shipping and taxes)"

  return (
    <div>
      <div className="flex flex-col gap-y-2 txt-medium text-ui-fg-subtle ">
        <div className="flex items-center justify-between">
          <span className="flex gap-x-1 items-center">{subtotalLabel}</span>
          <span data-testid="cart-subtotal" data-value={itemsSubtotal || 0}>
            {convertMinorToLocale({ amount: itemsSubtotal, currency_code })}
          </span>
        </div>
        {!!discount_total && (
          <div className="flex items-center justify-between">
            <span>Discount</span>
            <span
              className="text-ui-fg-interactive"
              data-testid="cart-discount"
              data-value={discount_total || 0}
            >
              -{" "}
              {convertMinorToLocale({ amount: discount_total ?? 0, currency_code })}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span>Shipping</span>
          <span data-testid="cart-shipping" data-value={shippingExTax || 0}>
            {convertMinorToLocale({ amount: shippingExTax, currency_code })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="flex gap-x-1 items-center ">{taxLabel}</span>
          <span data-testid="cart-taxes" data-value={tax_total || 0}>
            {convertMinorToLocale({ amount: tax_total ?? 0, currency_code })}
          </span>
        </div>
        {!!gift_card_total && (
          <div className="flex items-center justify-between">
            <span>Gift card</span>
            <span
              className="text-ui-fg-interactive"
              data-testid="cart-gift-card-amount"
              data-value={gift_card_total || 0}
            >
              -{" "}
              {convertMinorToLocale({ amount: gift_card_total ?? 0, currency_code })}
            </span>
          </div>
        )}
      </div>
      <div className="h-px w-full border-b border-gray-200 my-4" />
      <div className="flex items-center justify-between text-ui-fg-base mb-2 txt-medium ">
        <span>Total</span>
        <span
          className="txt-xlarge-plus"
          data-testid="cart-total"
          data-value={total || 0}
        >
          {convertMinorToLocale({ amount: total ?? 0, currency_code })}
        </span>
      </div>
      <div className="h-px w-full border-b border-gray-200 mt-4" />
    </div>
  )
}

export default CartTotals
