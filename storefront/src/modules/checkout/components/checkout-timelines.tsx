"use client"

import { useSearchParams } from "next/navigation"
import { Heading } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"

import VerticalStepTimeline from "@modules/checkout/components/vertical-step-timeline"
import {
  buildCheckoutProgressSteps,
  FULFILLMENT_PREVIEW_STEPS,
} from "@lib/util/checkout-progress"

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

      <section
        aria-labelledby="checkout-fulfillment-preview-title"
        className="border-t border-[rgba(26,26,46,0.08)] pt-6"
      >
        <Heading
          id="checkout-fulfillment-preview-title"
          level="h3"
          className="text-base font-semibold tracking-tight text-[var(--brand-primary)]"
        >
          After your order ships
        </Heading>
        <VerticalStepTimeline
          steps={FULFILLMENT_PREVIEW_STEPS}
          listAriaLabel="Illustrative order journey after dispatch"
          caption="Typical timeline once your package is on the way — not live tracking."
        />
      </section>
    </div>
  )
}
