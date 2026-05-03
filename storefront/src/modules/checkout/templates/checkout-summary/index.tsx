"use client"

import { Suspense } from "react"
import { Heading } from "@medusajs/ui"

import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import DiscountCode from "@modules/checkout/components/discount-code"
import CheckoutTimelines from "@modules/checkout/components/checkout-timelines"
import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"

const CheckoutSummary = ({ cart }: { cart: any }) => {
  return (
    <div className="small:sticky small:top-24 flex flex-col-reverse gap-y-0 py-2 small:py-0">
      <div className="w-full flex flex-col rounded-2xl border border-[rgba(26,26,46,0.1)] bg-white/95 p-5 shadow-[0_4px_40px_rgba(26,26,46,0.08)] backdrop-blur-sm small:p-6">
        <Suspense fallback={null}>
          <CheckoutTimelines cart={cart} />
        </Suspense>
        <Divider className="my-6" />
        <Heading
          level="h2"
          className="text-2xl font-semibold tracking-tight text-[var(--brand-primary)]"
        >
          In your cart
        </Heading>
        <p className="mt-1 text-sm text-ui-fg-subtle">
          Order summary — prices in {cart?.currency_code?.toUpperCase() ?? "AUD"}
          {cart?.currency_code?.toLowerCase() === "aud"
            ? ", excluding GST (calculated below)"
            : ""}
          .
        </p>
        <Divider className="my-5" />
        <CartTotals totals={cart} />
        <ItemsPreviewTemplate items={cart?.items} />
        <div className="mt-2 border-t border-[rgba(26,26,46,0.08)] pt-6">
          <DiscountCode cart={cart} />
        </div>
      </div>
    </div>
  )
}

export default CheckoutSummary
