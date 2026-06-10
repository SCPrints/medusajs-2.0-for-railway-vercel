import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { cacheLife, cacheTag } from "next/cache"
import { getRegion } from "./regions"
import { getBrandProducts } from "./brands"
import { LISTING_VIA_SEARCH_ENABLED, searchListing } from "./listing-search"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { ProductFilters } from "@modules/store/components/refinement-list/types"
import { sortProducts } from "@lib/util/sort-products"
import { isHoodieGarmentProduct } from "@modules/products/lib/variant-options"

/**
 * Match a product's brand against the URL `?brand=` filter. The filter value is the brand's
 * handle (URL-friendly) so the storefront filter is stable across renames; we also accept the
 * brand name (case-insensitive) for backwards compatibility with pre-migration links.
 *
 * Returns true if either the resolved brand handle or name matches the filter.
 */
function productBrandMatchesClientFilter(
  product: { brand?: { handle?: string | null; name?: string | null } | Array<{ handle?: string | null; name?: string | null }> | null },
  filterRaw: string
): boolean {
  const f = filterRaw.trim().toLowerCase()
  if (!f) return false
  const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand
  if (!brand) return false
  const handle = (brand.handle ?? "").trim().toLowerCase()
  if (handle && (handle === f || handle.replace(/-/g, "") === f.replace(/-/g, ""))) return true
  const name = (brand.name ?? "").trim().toLowerCase()
  if (name && name === f) return true
  return false
}

/**
 * Field expansion for storefront product queries.
 *
 * Every field here costs a JOIN or per-row computation on the backend. The
 * `*variants.calculated_price` materialisation is the single biggest cost
 * (price-list rules per variant per region) and is non-negotiable for any
 * surface that shows a price. Beyond that, only add fields the call site
 * actually consumes — Postgres time grows roughly linearly with this list.
 *
 * Why each field is here:
 *  - +metadata, +type, +tags    — PLP tile + filter chip rendering
 *  - +material                  — fabric (?fabric=) filter. Importers write the
 *                                 composition to the native `material` column,
 *                                 NOT metadata, so the filter reads it from here.
 *  - *variants.calculated_price — price line on every tile
 *  - *variants.options          — colour swatch resolution
 *  - +variants.metadata         — bulk_pricing tiers shown as "100+ A$x" line on tiles
 *  - +variants.sku              — SKU-prefix image matching for colour swatches
 *  - +variants.{manage_inventory, allow_backorder, inventory_quantity}
 *                                 — purchasable-variant picker (skips OOS swatches)
 *                                 + the "in stock only" PLP filter
 *  - *brand                     — brand badge + ?brand= filter (PLP) and brand landing
 *
 * Intentionally NOT here:
 *  - +weight, +variants.weight  — only PDP tabs and cart shipping use these.
 *    The PDP fetch is a single-product fetch so it's hand-listed in
 *    PDP_PRODUCT_FIELDS below.
 *  - +images                    — Medusa includes images by default; explicit
 *                                 expansion would re-join the images table.
 */
const STORE_PRODUCT_FIELDS =
  "+metadata,+material,+type,*variants.calculated_price,*variants.options,+variants.metadata,+variants.sku,+variants.manage_inventory,+variants.allow_backorder,+variants.inventory_quantity,+tags,*brand"

/**
 * Slimmer field set for the listing-via-search hydration path. Skips inventory
 * fields and a few other extras that the listing card doesn't render — the
 * Meili `in_stock` flag was already used to filter results, so the storefront
 * never re-checks inventory at render time.
 *
 * Why this matters: certain brands (Aussie Pacific in particular) have ~100+
 * variants per product (every colour × every size). The default field set
 * forced Medusa to compute calculated_price + materialize options + check
 * inventory across all ~1400 variants per page, taking 3-5 seconds. Trimming
 * the unused fields shaves a meaningful chunk off the backend response time.
 */
const LISTING_PRODUCT_FIELDS =
  "+metadata,+material,+type,*variants.calculated_price,*variants.options,+variants.metadata,+variants.sku,+tags,*brand"

/**
 * Single-product fetch (PDP) needs everything the list query needs PLUS the
 * shipping/weight fields used by the spec tab and cart line-item display.
 * Cost is amortised across one row, not 100, so the extra fields are fine.
 */
const PDP_PRODUCT_FIELDS = `${STORE_PRODUCT_FIELDS},+weight,+variants.weight`

export async function getProductsById({
  ids,
  regionId,
}: {
  ids: string[]
  regionId: string
}) {
  "use cache"
  cacheTag("products")
  // stale-while-revalidate: serve immediately + refresh in background.
  // expire=86400 (was 600) prevents the cache from being fully evicted
  // every 10 min, which was forcing cold-cache 4-second waits on the
  // next user. `revalidateTag("products")` (called from the backend on
  // product writes) invalidates faster when staff need it.
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  // Build-time prerender resilience: if the backend hiccups (503 under
  // concurrent build load), return [] instead of throwing so the entire
  // build doesn't fail over a single transient request. At runtime the
  // page renders "no products" briefly until the next cache refresh.
  try {
    const { products } = await sdk.store.product.list({
      id: ids,
      region_id: regionId,
      fields: STORE_PRODUCT_FIELDS,
    })
    return products
  } catch (error) {
    console.warn(
      "[getProductsById] backend fetch failed; returning empty array",
      (error as Error).message
    )
    return []
  }
}

/**
 * Hydrate an unordered set of product handles into region-priced products in a
 * single call. Used by the home-page curated sections (handles survive supplier
 * re-imports, so curation keyed by handle never silently breaks). Caller is
 * responsible for re-ordering the result to match its desired display order —
 * the backend does not preserve input order. Handles that don't resolve simply
 * don't come back (the section render skips them).
 */
export async function getProductsByHandle({
  handles,
  regionId,
}: {
  handles: string[]
  regionId: string
}) {
  "use cache"
  cacheTag("products")
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  if (!handles.length) {
    return []
  }
  try {
    const { products } = await sdk.store.product.list({
      // `handle` accepts an array at runtime; cast widens the SDK preview type.
      handle: handles,
      region_id: regionId,
      fields: STORE_PRODUCT_FIELDS,
      limit: handles.length,
    } as HttpTypes.FindParams & HttpTypes.StoreProductParams)
    return products
  } catch (error) {
    console.warn(
      "[getProductsByHandle] backend fetch failed; returning empty array",
      (error as Error).message
    )
    return []
  }
}

/**
 * Slimmer hydration path used by `getListingViaSearch`. Drops the inventory
 * fields and a few extras that the PLP listing card doesn't render — Meili
 * has already filtered by `in_stock` so re-checking server-side is wasted
 * work. For brands with variant-heavy catalogs (Aussie Pacific especially)
 * this is the difference between a 5s and a 1s page render.
 */
export async function getProductsByIdForListing({
  ids,
  regionId,
}: {
  ids: string[]
  regionId: string
}) {
  "use cache"
  cacheTag("products")
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  try {
    const { products } = await sdk.store.product.list({
      id: ids,
      region_id: regionId,
      fields: LISTING_PRODUCT_FIELDS,
    })
    return products
  } catch (error) {
    console.warn(
      "[getProductsByIdForListing] backend fetch failed; returning empty array",
      (error as Error).message
    )
    return []
  }
}

export async function getProductByHandle(
  handle: string,
  regionId?: string | null
) {
  "use cache"
  cacheTag("products", `product-${String(handle ?? "").trim().toLowerCase()}`)
  // stale-while-revalidate: serve immediately + refresh in background.
  // expire=86400 (was 600) prevents the cache from being fully evicted
  // every 10 min, which was forcing cold-cache 4-second waits on the
  // next user. `revalidateTag("products")` (called from the backend on
  // product writes) invalidates faster when staff need it.
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  const normalizedHandle = decodeURIComponent(String(handle ?? "")).trim().toLowerCase()
  if (!normalizedHandle) {
    return null
  }

  // `handle` is accepted at runtime; cast widens the SDK preview type.
  const baseParams = {
    handle: normalizedHandle,
    fields: PDP_PRODUCT_FIELDS,
  } as HttpTypes.FindParams & HttpTypes.StoreProductParams

  if (!regionId) {
    return null
  }

  try {
    const { products } = await sdk.store.product.list({
      ...baseParams,
      region_id: regionId,
    })

    return products[0] ?? null
  } catch {
    return null
  }
}

/**
 * Product listing uses the Store API `limit` + `offset` parameters (cursor pagination is not exposed
 * on `sdk.store.product.list`). Large `page` values increase database work proportional to OFFSET.
 * Complement storefront caching with Postgres indexes — see `backend/scripts/sql/catalog-product-list-index.sql`.
 */
export async function getProductsList({
  pageParam = 1,
  queryParams,
  countryCode,
  brandHandle,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode: string
  /**
   * When set, fetches via the dedicated brand endpoint instead of the generic product list.
   * Avoids the 10KB-URL problem where passing many product IDs as ?id= query params
   * exceeded proxy URL limits for large brands (AS Colour ~250 products).
   */
  brandHandle?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> {
  "use cache"
  cacheTag("products", ...(brandHandle ? [`brand-${brandHandle}`] : []))
  // stale-while-revalidate: serve immediately + refresh in background.
  // expire=86400 (was 600) prevents the cache from being fully evicted
  // every 10 min, which was forcing cold-cache 4-second waits on the
  // next user. `revalidateTag("products")` (called from the backend on
  // product writes) invalidates faster when staff need it.
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  const limit = queryParams?.limit || 12
  const validPageParam = Math.max(pageParam, 1);
  const offset = (validPageParam - 1) * limit
  const region = await getRegion(countryCode)

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  if (brandHandle) {
    const orderParam = (queryParams as any)?.order as string | undefined
    const typeIdRaw = (queryParams as any)?.type_id as string | string[] | undefined
    const tagIdRaw = (queryParams as any)?.tag_id as string | string[] | undefined
    const { products, count } = await getBrandProducts(brandHandle, {
      limit,
      offset,
      order: orderParam,
      region_id: region.id,
      type_id: typeIdRaw,
      tag_id: tagIdRaw,
    })
    const nextPage = count > offset + products.length ? pageParam + 1 : null
    return {
      response: { products, count },
      nextPage,
      queryParams,
    }
  }

  // Build-time prerender resilience: backend can 503 under concurrent build
  // load. Degrade to an empty page instead of failing the entire build over
  // a single transient request.
  try {
    const { products, count } = await sdk.store.product.list({
      limit,
      offset,
      region_id: region.id,
      fields: STORE_PRODUCT_FIELDS,
      ...queryParams,
    })
    const nextPage = count > offset + limit ? pageParam + 1 : null
    return {
      response: { products, count },
      nextPage,
      queryParams,
    }
  } catch (error) {
    console.warn(
      "[getProductsList] backend fetch failed; returning empty page",
      (error as Error).message
    )
    return {
      response: { products: [], count: 0 },
      nextPage: null,
      queryParams,
    }
  }
}

const HOME_FEATURED_LIMIT = 12
const HOME_FEATURED_SEARCH_FETCH = 48
const HOME_FEATURED_CATALOG_BATCH = 100
const HOME_FEATURED_MAX_CATALOG_PAGES = 40

/**
 * Home “Featured range”: load hoodies via store search (`q`) plus a catalog scan.
 * Newest products alone are often bags/accessories, so a plain `limit` slice misses apparel.
 */
export async function getHomeFeaturedRangeProducts({
  countryCode,
  limit = HOME_FEATURED_LIMIT,
}: {
  countryCode: string
  limit?: number
}): Promise<HttpTypes.StoreProduct[]> {
  "use cache"
  cacheTag("products", "home-featured")
  cacheLife({ revalidate: 300, stale: 300, expire: 600 })
  const region = await getRegion(countryCode)
  if (!region) {
    return []
  }

  const addHoodies = (
    acc: Map<string, HttpTypes.StoreProduct>,
    list: HttpTypes.StoreProduct[]
  ) => {
    for (const p of list) {
      if (!p.id || acc.has(p.id)) {
        continue
      }
      if (isHoodieGarmentProduct(p)) {
        acc.set(p.id, p)
      }
    }
  }

  const byId = new Map<string, HttpTypes.StoreProduct>()

  for (const q of ["hoodie", "hood", "sweatshirt"]) {
    if (byId.size >= limit) {
      break
    }
    const { response } = await getProductsList({
      countryCode,
      // `q` (full-text search) is accepted at runtime; cast over preview-type drift.
      queryParams: {
        q,
        limit: HOME_FEATURED_SEARCH_FETCH,
      } as Parameters<typeof getProductsList>[0]["queryParams"],
    })
    addHoodies(byId, response.products)
  }

  let page = 1
  while (byId.size < limit && page <= HOME_FEATURED_MAX_CATALOG_PAGES) {
    const { response } = await getProductsList({
      countryCode,
      pageParam: page,
      queryParams: { limit: HOME_FEATURED_CATALOG_BATCH },
    })
    if (!response.products.length) {
      break
    }
    addHoodies(byId, response.products)
    page++
  }

  const hoodies = Array.from(byId.values()).slice(0, limit)
  if (hoodies.length > 0) {
    return hoodies
  }

  const { response } = await getProductsList({
    countryCode,
    queryParams: { limit },
  })
  return response.products
}

const CLIENT_FILTER_PAGE_BATCH = 100
/** Avoid unbounded API loops if `count` is wrong or the catalog is huge */
const CLIENT_FILTER_MAX_PAGES = 80

/**
 * Listing-via-search: sort + filter + paginate the listing IN Meilisearch,
 * then hydrate the page's product IDs via Medusa for live region pricing.
 * Returns `null` on any miss (flag off / unconfigured / Meili error) so the
 * caller falls back to the legacy in-memory scan. A legit empty category
 * returns an empty page (NOT null) so we don't fall back to the full catalog.
 */
async function getListingViaSearch({
  page,
  limit,
  queryParams,
  sortBy,
  filters,
  countryCode,
  brandHandle,
}: {
  page: number
  limit: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy: SortOptions
  filters?: ProductFilters
  countryCode: string
  brandHandle?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
} | null> {
  const qp = (queryParams ?? {}) as Record<string, unknown>
  const firstOf = (v: unknown): string | undefined => {
    if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined
    return typeof v === "string" ? v : undefined
  }
  const allOf = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) {
      const out = v.filter((s): s is string => typeof s === "string")
      return out.length ? out : undefined
    }
    return typeof v === "string" ? [v] : undefined
  }

  const result = await searchListing({
    scope: {
      // ALL category ids, not just the first — audience landing pages pass
      // parent + children (products are only assigned to leaf categories).
      categoryIds: allOf(qp.category_id),
      collectionId: firstOf(qp.collection_id),
      brandHandle,
    },
    filters: {
      minPrice: filters?.minPrice,
      maxPrice: filters?.maxPrice,
      inStock: filters?.inStock,
      brand: filters?.brand,
      fabric: filters?.fabric,
      // type/tag arrive via queryParams (PaginatedProducts), not the filters object.
      typeId: firstOf(qp.type_id) ?? filters?.typeId,
      tagId: firstOf(qp.tag_id) ?? filters?.tagId,
    },
    sortBy,
    page,
    limit,
  })

  if (!result) return null

  if (result.ids.length === 0) {
    return { response: { products: [], count: result.count }, nextPage: null, queryParams }
  }

  const region = await getRegion(countryCode)
  if (!region) return null

  // Use the slim hydration variant — drops inventory fields the listing card
  // doesn't render. For Aussie Pacific (~120 variants per product) this cuts
  // the backend response from ~5s to ~1s.
  const hydrated = await getProductsByIdForListing({ ids: result.ids, regionId: region.id })
  // getProductsByIdForListing returns products in arbitrary order — restore Meili's ranking.
  const rank = new Map(result.ids.map((id, i) => [id, i]))
  const products = [...hydrated].sort(
    (a, b) => (rank.get(a.id ?? "") ?? 0) - (rank.get(b.id ?? "") ?? 0)
  )

  const nextPage = result.count > page * limit ? page + 1 : null
  return { response: { products, count: result.count }, nextPage, queryParams }
}

/**
 * Fetches products for list views.
 * - With LISTING_VIA_SEARCH on (production): ALL sorts + filters go through
 *   Meilisearch (sort/filter/paginate in the index, hydrate 12 IDs via the
 *   slim field set). Falls back to the legacy paths below on any Meili miss.
 * - Legacy default “Latest” (`created_at`) with no client filters: one Medusa
 *   page + API `count` so pagination matches the full catalog.
 * - Legacy price/title sort or brand-fabric-price-stock filters: loads the
 *   catalog in batches (up to a cap), then filters/sorts/slices in memory.
 */
export async function getProductsListWithSort({
  page = 1,
  queryParams,
  sortBy = "created_at",
  filters,
  countryCode,
  brandHandle,
}: {
  page?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy?: SortOptions
  filters?: ProductFilters
  countryCode: string
  brandHandle?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> {
  "use cache"
  cacheTag("products", ...(brandHandle ? [`brand-${brandHandle}`] : []))
  // stale-while-revalidate: serve immediately + refresh in background.
  // expire=86400 (was 600) prevents the cache from being fully evicted
  // every 10 min, which was forcing cold-cache 4-second waits on the
  // next user. `revalidateTag("products")` (called from the backend on
  // product writes) invalidates faster when staff need it.
  cacheLife({ revalidate: 120, stale: 86400, expire: 86400 })
  const limit = queryParams?.limit || 12
  const resolvedPage = !page || page < 1 ? 1 : page

  const getMetadataValue = (product: HttpTypes.StoreProduct, keys: string[]) => {
    const metadata = (product.metadata ?? {}) as Record<string, unknown>

    for (const key of keys) {
      const value = metadata[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    }

    return null
  }

  const hasClientFilters = Boolean(
    filters?.brand ||
      filters?.fabric ||
      typeof filters?.minPrice === "number" ||
      typeof filters?.maxPrice === "number" ||
      filters?.inStock
  )

  // Sorts backed by a real, indexed product column are ordered + paginated by
  // the Medusa API directly (one page, no scan). Price sorts are excluded on
  // purpose: calculated prices are per-variant/per-region and aren't an
  // orderable column, so they fall through to the in-memory scan below.
  const API_SORT_ORDER: Partial<Record<SortOptions, string>> = {
    created_at: "-created_at",
    title_asc: "title",
    title_desc: "-title",
  }
  const useApiPagination = Boolean(API_SORT_ORDER[sortBy]) && !hasClientFilters

  // Listing-via-search (flag-gated): Meili sorts/filters/paginates and we
  // hydrate just the page's 12 IDs with the slim field set. Used for ALL
  // sorts INCLUDING the default created_at view — the Medusa default-listing
  // query (full variant price + inventory expansion + count) was the slowest
  // query on the site (measured 14.5s cold on /categories/mens-t-shirts,
  // 2026-06-10), while the Meili+hydrate path measures ~4s cold / sub-second
  // warm. `id` queryParams = a Meili-search results page (bounded already) —
  // leave those on the legacy paths. Any miss/error returns null and falls
  // through to the legacy path below.
  if (LISTING_VIA_SEARCH_ENABLED && !(queryParams as Record<string, unknown>)?.id) {
    const viaSearch = await getListingViaSearch({
      page: resolvedPage,
      limit,
      queryParams,
      sortBy,
      filters,
      countryCode,
      brandHandle,
    })
    if (viaSearch) {
      // An EMPTY result on an unfiltered default view is ambiguous: genuinely
      // empty category vs stale/partial index. Fall through to the API path
      // there — it's cheap for column-backed sorts and authoritative. Filtered
      // views keep the empty page (their fallback would be the full catalog
      // scan, which is exactly what this path exists to avoid).
      if (viaSearch.response.products.length > 0 || !useApiPagination) {
        return viaSearch
      }
    }
  }

  if (useApiPagination) {
    const { response } = await getProductsList({
      pageParam: resolvedPage,
      queryParams: {
        ...queryParams,
        order: API_SORT_ORDER[sortBy],
        limit,
      },
      countryCode,
      brandHandle,
    })
    const { products, count } = response
    const offsetStart = (resolvedPage - 1) * limit
    const hasMore = count > offsetStart + products.length
    return {
      response: { products, count },
      nextPage: hasMore ? resolvedPage + 1 : null,
      queryParams,
    }
  }

  let products: HttpTypes.StoreProduct[] = []

  let pageIdx = 1
  while (pageIdx <= CLIENT_FILTER_MAX_PAGES) {
    const batch = await getProductsList({
      pageParam: pageIdx,
      queryParams: {
        ...queryParams,
        limit: CLIENT_FILTER_PAGE_BATCH,
      },
      countryCode,
      brandHandle,
    })
    const batchProducts = batch.response.products
    const total = batch.response.count
    products.push(...batchProducts)
    if (batchProducts.length < CLIENT_FILTER_PAGE_BATCH || products.length >= total) {
      break
    }
    pageIdx++
  }

  const filteredProducts = products.filter((product) => {
    const variantPrices = (product.variants ?? [])
      .map((variant) => variant?.calculated_price?.calculated_amount)
      .filter((price): price is number => typeof price === "number")
    const minVariantPrice = variantPrices.length ? Math.min(...variantPrices) : null
    const hasStock = (product.variants ?? []).some(
      (variant) =>
        (variant as HttpTypes.StoreProductVariant)?.inventory_quantity === undefined ||
        (variant as HttpTypes.StoreProductVariant)?.inventory_quantity === null ||
        (variant as HttpTypes.StoreProductVariant).inventory_quantity! > 0
    )
    // Importers write the composition to the native `material` column; only a
    // handful of suppliers stash it in metadata. Check both, metadata first.
    const fabricRaw =
      getMetadataValue(product, ["fabric_type", "fabric", "material", "composition"]) ??
      (typeof product.material === "string" && product.material.trim()
        ? product.material.trim()
        : null)
    const fabric = fabricRaw?.toLowerCase()

    if (typeof filters?.minPrice === "number") {
      if (minVariantPrice === null || minVariantPrice < filters.minPrice) {
        return false
      }
    }

    if (typeof filters?.maxPrice === "number") {
      if (minVariantPrice === null || minVariantPrice > filters.maxPrice) {
        return false
      }
    }

    if (filters?.inStock && !hasStock) {
      return false
    }

    if (filters?.brand) {
      if (!productBrandMatchesClientFilter(product as any, filters.brand)) {
        return false
      }
    }

    if (filters?.fabric && fabric && !fabric.includes(filters.fabric.toLowerCase())) {
      return false
    }

    if (filters?.fabric && !fabric) {
      return false
    }

    return true
  })

  const sortedProducts = sortProducts(filteredProducts, sortBy)

  const sliceStart = (resolvedPage - 1) * limit

  const filteredCount = sortedProducts.length
  const nextPage = filteredCount > sliceStart + limit ? sliceStart + limit : null

  const paginatedProducts = sortedProducts.slice(sliceStart, sliceStart + limit)

  return {
    response: {
      products: paginatedProducts,
      count: filteredCount,
    },
    nextPage,
    queryParams,
  }
}
