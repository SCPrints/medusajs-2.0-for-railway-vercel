import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cache } from "react"

const FACETS_FETCH_INIT = {
  next: { tags: ["catalog-facets"], revalidate: 120 },
}

/**
 * Store facet lists — `@medusajs/js-sdk` Store namespace does not expose product types/tags helpers;
 * uses the SDK client against `/store/product-*` like other resources.
 */
export const listStoreProductTypes = cache(async function (): Promise<
  HttpTypes.StoreProductType[]
> {
  try {
    const res = (await sdk.client.fetch(`/store/product-types`, {
      query: { limit: 200, offset: 0 },
      headers: FACETS_FETCH_INIT,
    })) as { product_types?: HttpTypes.StoreProductType[] }
    const rows = res.product_types ?? []
    return [...rows].sort((a, b) =>
      (a.value ?? "").localeCompare(b.value ?? "", undefined, { sensitivity: "base" })
    )
  } catch {
    return []
  }
})

export const listStoreProductTags = cache(async function (): Promise<
  HttpTypes.StoreProductTag[]
> {
  try {
    const res = (await sdk.client.fetch(`/store/product-tags`, {
      query: { limit: 500, offset: 0 },
      headers: FACETS_FETCH_INIT,
    })) as { product_tags?: HttpTypes.StoreProductTag[] }
    const rows = res.product_tags ?? []
    return [...rows].sort((a, b) =>
      (a.value ?? "").localeCompare(b.value ?? "", undefined, { sensitivity: "base" })
    )
  } catch {
    return []
  }
})
