import Stripe from "stripe"

import { STRIPE_API_KEY } from "../../lib/constants"

/**
 * Lazy Stripe SDK singleton. Returns null when STRIPE_API_KEY is unset so
 * dev environments without Stripe config still boot. Callers must handle
 * the null case (typically by returning 503 from an admin route).
 *
 * We pin the API version so Stripe webhook payload shapes don't drift
 * silently underneath us. Bump only when you're ready to read the
 * upgrade notes.
 */
let cached: Stripe | null | undefined

export const getStripeClient = (): Stripe | null => {
  if (cached !== undefined) {
    return cached
  }
  if (!STRIPE_API_KEY) {
    cached = null
    return null
  }
  cached = new Stripe(STRIPE_API_KEY, {
    // Pinned to 2024-04-10 (what this code was written and tested against,
    // and what Medusa's own Stripe provider still creates cart PaymentIntents
    // on). The SDK's types only accept its latest version (stripe@23 →
    // 2026-09-30.endive), so per Stripe's README the pin needs this override.
    // Move the pin only after reading the API changelog for Products, Prices,
    // Payment Links and Checkout Sessions.
    // @ts-expect-error stripe-version-2024-04-10
    apiVersion: "2024-04-10",
    typescript: true,
    appInfo: {
      name: "sc-prints-payment-link",
      version: "1.0.0",
    },
  })
  return cached
}

/** Reset the cache. Test-only. */
export const __resetStripeClient = () => {
  cached = undefined
}
