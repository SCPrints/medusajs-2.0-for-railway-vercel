import { NextResponse } from "next/server"

import { listBrands } from "@lib/data/brands"
import {
  listStoreProductTags,
  listStoreProductTypes,
} from "@lib/data/catalog-facets"
import { getCategoryByHandle } from "@lib/data/categories"
import { getHomeSections } from "@lib/data/home-sections"
import { getLookbookPool } from "@lib/data/lookbook"
import { getProductionEta } from "@lib/data/production-eta"
import {
  getProductsByHandle,
  getProductsListWithSort,
} from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { listShopCategoriesMenu } from "@lib/data/shop-categories-menu"
import type { ProductFilters } from "@modules/store/components/refinement-list/types"

/**
 * Background cache warmer — keeps the slow `"use cache"` entries permanently
 * populated so real users never pay the cold-cache wait.
 *
 * Why this exists:
 *   Under cacheComponents (PPR) the LCP element of every listing page streams
 *   behind the data fetches. Warm, that's ~1.8s; cold, the category default
 *   listing was measured at 14.5s (2026-06-10). The cache goes cold on every
 *   deploy (several per day), on `revalidateTag("products")` from backend
 *   writes, and on the 24h `expire` — so without warming, a large share of
 *   real traffic lands on cold entries.
 *
 * What it warms:
 *   1. Catalog facets (tags, types, brands, shop-categories menu) — used by
 *      every PLP + the nav.
 *   2. The DEFAULT listing (page 1, created_at, no filters) for the top
 *      category pages — the exact cache entries PaginatedProducts reads.
 *      Handles configurable via WARM_CACHE_CATEGORY_HANDLES (comma-separated).
 *   3. The home page's data chain: curated home sections + their product
 *      hydration, production ETA, lookbook pool.
 *
 * IMPORTANT — cache-key fidelity:
 *   `warmCategoryListing` must construct its getProductsListWithSort arguments
 *   in EXACTLY the shape PaginatedProducts uses (same keys, same insertion
 *   order, same undefined/false values), otherwise it warms a different cache
 *   entry and silently helps nobody. If you change the call shape in
 *   paginated-products.tsx, mirror it here.
 *
 * Auth:
 *   When `CRON_SECRET` is set (Vercel injects it as `Authorization: Bearer
 *   ${CRON_SECRET}` on cron invocations), the route REQUIRES that header and
 *   401s otherwise. This stops anyone hammering the route to amplify load on
 *   the backend catalog queries. When unset (local dev), the gate is skipped.
 *
 * Schedule:
 *   Configured in vercel.json (Pro plan — full cron fidelity). Runs in ~1-2s
 *   when all caches are warm; up to ~30s on a true cold cache.
 */

const DEFAULT_WARM_CATEGORY_HANDLES = [
  "mens",
  "womens",
  "kids",
  "mens-t-shirts",
  "mens-polos",
  "workwear",
]

const PRODUCT_LIMIT = 12 // mirror PaginatedProducts

function warmCountryCode(): string {
  return (process.env.NEXT_PUBLIC_DEFAULT_REGION || "au").toLowerCase()
}

function warmCategoryHandles(): string[] {
  const raw = process.env.WARM_CACHE_CATEGORY_HANDLES
  if (!raw) return DEFAULT_WARM_CATEGORY_HANDLES
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/** Warm the default-view listing entry for one category page. */
async function warmCategoryListing(handle: string, countryCode: string) {
  const { product_categories } = await getCategoryByHandle([handle])
  const category = product_categories?.[product_categories.length - 1]
  if (!category?.id) {
    throw new Error(`category handle "${handle}" did not resolve`)
  }

  // Parent + active children — MUST mirror CategoryTemplate's construction
  // (same filter, same order) so the warmed cache key matches the page's.
  const children = (
    (category.category_children ?? []) as Array<{
      id: string
      handle?: string | null
      name?: string | null
      is_active?: boolean | null
    }>
  ).filter((c) => c?.handle && c?.name && c?.is_active !== false)

  // Mirror PaginatedProducts exactly: `{ limit }` first, then category_id.
  const queryParams: { limit: number; category_id?: string[] } = {
    limit: PRODUCT_LIMIT,
  }
  queryParams.category_id = [category.id, ...children.map((c) => c.id)]

  const result = await getProductsListWithSort({
    page: 1,
    queryParams,
    sortBy: "created_at",
    filters: {
      minPrice: undefined,
      maxPrice: undefined,
      inStock: false,
      brand: undefined,
      fabric: undefined,
    } as ProductFilters,
    countryCode,
    brandHandle: undefined,
  })
  return result.response.count
}

/** Warm the home page's data chain (sections + product hydration). */
async function warmHomeSections(countryCode: string) {
  const region = await getRegion(countryCode)
  const sections = await getHomeSections()
  const handles = Array.from(
    new Set(
      sections
        .flatMap((s) => s.product_handles)
        .filter((h) => !h.startsWith("bundle:"))
    )
  )
  if (region && handles.length) {
    await getProductsByHandle({ handles, regionId: region.id })
  }
  return sections.length
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }
  }

  const countryCode = warmCountryCode()
  const categoryHandles = warmCategoryHandles()
  const start = Date.now()

  const facetResults = await Promise.allSettled([
    listStoreProductTags(),
    listStoreProductTypes(),
    listBrands(),
    listShopCategoriesMenu(),
  ])

  const pageResults = await Promise.allSettled([
    warmHomeSections(countryCode),
    getProductionEta(),
    getLookbookPool(),
    ...categoryHandles.map((h) => warmCategoryListing(h, countryCode)),
  ])

  const settledValue = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled"
      ? Array.isArray(r.value)
        ? r.value.length
        : (r.value as number | object | null) ?? "ok"
      : "error"

  const summary = {
    elapsedMs: Date.now() - start,
    tags: settledValue(facetResults[0]),
    types: settledValue(facetResults[1]),
    brands: settledValue(facetResults[2]),
    categoriesMenu: settledValue(facetResults[3]),
    homeSections: settledValue(pageResults[0]),
    productionEta: pageResults[1].status === "fulfilled" ? "ok" : "error",
    lookbookPool: settledValue(pageResults[2]),
    categories: Object.fromEntries(
      categoryHandles.map((h, i) => [h, settledValue(pageResults[i + 3])])
    ),
    errors: [...facetResults, ...pageResults]
      .map((r, i) => (r.status === "rejected" ? `${i}: ${r.reason}` : null))
      .filter(Boolean),
  }

  return NextResponse.json(summary)
}
