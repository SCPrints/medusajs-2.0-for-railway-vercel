"use client"

import { Button, Heading } from "@medusajs/ui"

import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"
import DiscountCode from "@modules/checkout/components/discount-code"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import DeliveryEstimate from "@modules/cart/components/delivery-estimate"
import CartEngagement from "@modules/cart/components/cart-engagement"
import RequestQuote from "@modules/cart/components/request-quote"
import DownloadQuote from "@modules/cart/components/download-quote"
import {
  SUPACOLOUR_MINIMUM_MESSAGE,
  type SupacolourShortfall,
} from "@modules/customizer/lib/scp-supacolour-pricing"
import { HttpTypes } from "@medusajs/types"

type SummaryProps = {
  cart: HttpTypes.StoreCart & {
    promotions: HttpTypes.StorePromotion[]
  }
  supacolourShortfalls?: SupacolourShortfall[]
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart, supacolourShortfalls = [] }: SummaryProps) => {
  const step = getCheckoutStep(cart)

  return (
    <div className="flex flex-col gap-y-5 rounded-2xl border border-ui-border-base bg-ui-bg-base p-5 small:p-6">
      <Heading level="h2" className="text-2xl leading-8">
        Summary
      </Heading>
      <DiscountCode cart={cart} />
      <Divider />
      <CartTotals totals={cart} />
      <DeliveryEstimate cartMetadata={cart.metadata as Record<string, unknown> | null} />
      {supacolourShortfalls.length ? (
        <div role="alert" className="flex flex-col gap-y-1 text-sm text-rose-600" data-testid="supacolour-minimum">
          <p>{SUPACOLOUR_MINIMUM_MESSAGE}</p>
          <ul className="list-disc pl-4">
            {supacolourShortfalls.map((shortfall) => (
              <li key={shortfall.lineIds.join()}>
                {Array.from(
                  new Set(
                    (cart.items ?? [])
                      .filter((item) => shortfall.lineIds.includes(item.id))
                      .map((item) => item.product_title)
                  )
                ).join(", ")}
                : {shortfall.quantity} in this design
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {supacolourShortfalls.length ? (
        <Button className="h-11 w-full" disabled data-testid="checkout-button">
          Go to checkout
        </Button>
      ) : (
        <LocalizedClientLink
          href={"/checkout?step=" + step}
          data-testid="checkout-button"
        >
          <Button className="h-11 w-full">Go to checkout</Button>
        </LocalizedClientLink>
      )}
      <RequestQuote email={cart.email} />
      <DownloadQuote email={cart.email} />
      <CartEngagement cart={cart} />
    </div>
  )
}

export default Summary
