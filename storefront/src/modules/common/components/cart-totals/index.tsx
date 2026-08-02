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

  // INC-GST display (HOLD cutover, Docs/GST_INC_PRICING_SCOPE.md): every row
  // shows tax-inclusive figures so the summary matches the inc-GST unit prices
  // on the line items, and the GST row is informational ("Includes GST"), not
  // additive. Rows reconcile for the customer as:
  //   subtotal − discount + shipping − gift card = Total.
  //
  // The items figure is DERIVED (total − shipping + discount + gift card)
  // rather than read from a field because it's the only expression that is
  // exact in BOTH tax regimes — it equals items-incl-their-GST pre-discount
  // whether Medusa is adding GST on top (pre-cutover carts) or extracting it
  // (post-cutover). `item_subtotal` is ex-GST and would sit visibly below the
  // line items it claims to sum; Medusa's `subtotal` additionally INCLUDES
  // shipping (see @medusajs/types cart common.d.ts) — avoid both.
  const itemsIncGst = Math.max(
    0,
    (total ?? 0) -
      (shipping_total ?? 0) +
      (discount_total ?? 0) +
      (gift_card_total ?? 0)
  )

  // `shipping_total` is the tax-inclusive shipping figure in both regimes —
  // matches the "inc GST" label on the shipping option at checkout.
  const shippingIncGst = shipping_total ?? shipping_subtotal ?? 0

  const isAud = currency_code?.toLowerCase() === "aud"
  const taxLabel = isAud ? "Includes GST" : "Includes taxes"
  const subtotalLabel = isAud
    ? "Subtotal (inc GST, excl. shipping)"
    : "Subtotal (incl. taxes, excl. shipping)"

  return (
    <div>
      <div className="flex flex-col gap-y-2 txt-medium text-ui-fg-subtle ">
        <div className="flex items-center justify-between">
          <span className="flex gap-x-1 items-center">{subtotalLabel}</span>
          <span data-testid="cart-subtotal" data-value={itemsIncGst || 0}>
            {convertMinorToLocale({ amount: itemsIncGst, currency_code })}
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
          <span data-testid="cart-shipping" data-value={shippingIncGst || 0}>
            {convertMinorToLocale({ amount: shippingIncGst, currency_code })}
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
