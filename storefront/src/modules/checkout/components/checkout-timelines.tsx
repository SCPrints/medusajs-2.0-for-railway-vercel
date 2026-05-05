"use client"

import { useSearchParams } from "next/navigation"
import { Heading } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"

import VerticalStepTimeline from "@modules/checkout/components/vertical-step-timeline"
import { buildCheckoutProgressSteps } from "@lib/util/checkout-progress"

export default function CheckoutTimelines({
  cart,
}: {
  cart: HttpTypes.StoreCart
}) {
  const searchParams = useSearchParams()
  const checkoutSteps = buildCheckoutProgressSteps(
    cart,
    searchParams.get("step")
  )

  return (
    <div className="flex flex-col gap-y-8">
      <section aria-labelledby="checkout-progress-title">
        <Heading
          id="checkout-progress-title"
          level="h2"
          className="text-lg font-semibold tracking-tight text-[var(--brand-primary)]"
        >
          Your progress
        </Heading>
        <p className="mt-1 text-xs text-ui-fg-subtle" id="checkout-progress-hint">
          You can move between sections as you complete each part.
        </p>
        <div className="mt-4" aria-describedby="checkout-progress-hint">
          <VerticalStepTimeline
            steps={checkoutSteps}
            listAriaLabel="Checkout steps"
          />
        </div>
      </section>
    </div>
  )
}
