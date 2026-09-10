import { getCustomerTier } from "@lib/data/customer-tier"
import { HttpTypes } from "@medusajs/types"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Resolves the customer tier (a cookies() read → dynamic) and renders the
 * product actions. The product itself comes from ProductOptionsContext, which
 * the PDP mounts in the static shell with the client-slimmed product — so this
 * dynamic slot serialises only the tier, not a second copy of a 500-variant
 * product. (It used to re-fetch the product by id here "for real-time pricing";
 * that fetch hit the same 120s `"use cache"` entry the page already rendered
 * from, so it bought nothing but a duplicate payload.)
 */
export default async function ProductActionsWrapper({
  region,
  hideInlinePurchaseControls = false,
}: {
  /** Kept for call-site compatibility; the product is read from context. */
  id?: string
  region: HttpTypes.StoreRegion
  hideInlinePurchaseControls?: boolean
}) {
  const tier = await getCustomerTier()

  return (
    <ProductActions
      region={region}
      hideInlinePurchaseControls={hideInlinePurchaseControls}
      tier={tier}
    />
  )
}
