import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"

/**
 * Store facet lists — `@medusajs/js-sdk` Store namespace does not expose product types/tags helpers;
 * uses the SDK client against `/store/product-*` like other resources.
 *
 * Previously these used `React.cache()` (per-request memoization only) + an
 * inert `next:` block nested inside `headers:` — Next.js silently ignored that
 * cache config so every brand/category/store page render fired a fresh
 * backend fetch. The backend `/store/product-tags` query takes ~4 seconds for
 * the 243-row catalog, which was the dominant cost on every PLP render
 * (~5s baseline, including the 4s tags fetch sitting inside the parallel
 * block in `StoreTemplate`).
 *
 * Switched to Next.js 16 `"use cache"` + `cacheLife` so the facet lists are
 * cached across requests for an hour. Tags + types change rarely (only when
 * staff edit the catalog) — when they do, `revalidateTag("catalog-facets")`
 * from an admin webhook would invalidate. Long stale window means the
 * revalidation never blocks a user's request.
 */
/**
 * Medusa's default `/store/product-tags` and `/store/product-types` endpoints
 * eagerly expand the FULL `products` array on each row. For our catalog
 * (243 tags × ~5 products each on average) that's a 3.9 MB payload and a 4-5s
 * round-trip even though we only need `id` + `value` for filter dropdowns.
 * Restricting `fields` shrinks the payload to ~15 KB and drops the call to
 * ~100ms. This is the dominant cost on cold PLP cache misses.
 */
const FACET_FIELDS = "id,value"

export async function listStoreProductTypes(): Promise<
  HttpTypes.StoreProductType[]
> {
  "use cache"
  cacheTag("catalog-facets", "product-types")
  cacheLife({ revalidate: 3600, stale: 86400, expire: 86400 })
  try {
    const res = (await sdk.client.fetch(`/store/product-types`, {
      query: { limit: 200, offset: 0, fields: FACET_FIELDS },
    })) as { product_types?: HttpTypes.StoreProductType[] }
    const rows = res.product_types ?? []
    return [...rows].sort((a, b) =>
      (a.value ?? "").localeCompare(b.value ?? "", undefined, { sensitivity: "base" })
    )
  } catch {
    return []
  }
}

export async function listStoreProductTags(): Promise<
  HttpTypes.StoreProductTag[]
> {
  "use cache"
  cacheTag("catalog-facets", "product-tags")
  cacheLife({ revalidate: 3600, stale: 86400, expire: 86400 })
  try {
    const res = (await sdk.client.fetch(`/store/product-tags`, {
      query: { limit: 500, offset: 0, fields: FACET_FIELDS },
    })) as { product_tags?: HttpTypes.StoreProductTag[] }
    const rows = res.product_tags ?? []
    return [...rows].sort((a, b) =>
      (a.value ?? "").localeCompare(b.value ?? "", undefined, { sensitivity: "base" })
    )
  } catch {
    return []
  }
}
