import { sdk } from "@lib/config"
import { cache } from "react"

/**
 * Provider IDs that must never be offered to a real customer at checkout.
 * `pp_system_default` is Medusa's built-in "Manual Payment" provider — it
 * marks an order paid without taking any money, so it has no place on the
 * live storefront. We filter it here (rather than only hiding it in the UI)
 * so it can't leak through any code path that consumes this list. Belt-and-
 * braces: it should also be disabled on the region in Medusa admin
 * (Settings → Regions → Payment Providers).
 */
const HIDDEN_PAYMENT_PROVIDER_PREFIXES = ["pp_system_default"]

const isHiddenPaymentProvider = (providerId?: string) =>
  HIDDEN_PAYMENT_PROVIDER_PREFIXES.some((prefix) =>
    providerId?.startsWith(prefix)
  )

// Shipping actions
export const listCartPaymentMethods = cache(async function (regionId: string) {
  return sdk.store.payment
    .listPaymentProviders(
      { region_id: regionId },
      { next: { tags: ["payment_providers"] } }
    )
    .then(({ payment_providers }) =>
      payment_providers.filter(
        (provider) => !isHiddenPaymentProvider(provider.id)
      )
    )
    .catch(() => {
      return null
    })
})
