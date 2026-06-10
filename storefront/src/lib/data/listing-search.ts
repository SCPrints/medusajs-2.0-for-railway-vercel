import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

/**
 * Server-side Meilisearch listing query.
 *
 * Powers the "listing via search" path: category / store / collection / brand
 * product grids sort + filter + paginate INSIDE Meilisearch, then the page's
 * product IDs are hydrated via Medusa for live region pricing. This replaces
 * the in-memory catalog scan (`getProductsListWithSort`'s batch loop) that ran
 * for every non-`created_at` sort and every brand/fabric/price/stock filter.
 *
 * Gated by `LISTING_VIA_SEARCH` so it can ship dark: deploy → reindex (so the
 * new `min_price_aud` / `category_ids` / `in_stock` fields populate + the
 * sortable/filterable index settings apply) → flip the flag. Returns `null` on
 * any miss (flag off, unconfigured, Meili error, or premature flip before the
 * index settings exist) so the caller falls back to the legacy Medusa path.
 */

const SEARCH_ENDPOINT = process.env.NEXT_PUBLIC_SEARCH_ENDPOINT
const SEARCH_API_KEY = process.env.NEXT_PUBLIC_SEARCH_API_KEY
const SEARCH_INDEX_NAME = process.env.NEXT_PUBLIC_INDEX_NAME || "products"

export const LISTING_VIA_SEARCH_ENABLED =
  process.env.LISTING_VIA_SEARCH === "true" ||
  process.env.NEXT_PUBLIC_LISTING_VIA_SEARCH === "true"

/** Hard cap on the Meili round-trip so a slow/unreachable index degrades to the
 *  legacy path instead of hanging the page.
 *
 *  Enabling `LISTING_VIA_SEARCH=true` swaps the storefront's filter path from
 *  the in-memory catalog scan (5 Medusa API round-trips for a 500-product
 *  brand → ~20s wall-clock) to a single Meili query (~200ms). The fabric/brand
 *  fields needed are populated for >95% of the catalog as of 2026-06-01. */
const LISTING_SEARCH_TIMEOUT_MS = 4000

const SORT_MAP: Record<SortOptions, string[]> = {
  created_at: ["created_at_ts:desc"],
  price_asc: ["min_price_aud:asc"],
  price_desc: ["min_price_aud:desc"],
  title_asc: ["title:asc"],
  title_desc: ["title:desc"],
}

export type ListingScope = {
  /** One or more category ids (parent + children for audience landing pages). */
  categoryIds?: string[]
  collectionId?: string
  brandHandle?: string
}

export type ListingFilters = {
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  brand?: string
  fabric?: string
  typeId?: string
  tagId?: string
}

/** Meili filter literals are double-quoted; escape embedded quotes/backslashes. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function buildFilter(scope: ListingScope, filters: ListingFilters): string[] {
  const clauses: string[] = []

  if (scope.categoryIds?.length) {
    // OR across parent + child ids — `category_ids` is an array field, so any
    // membership match qualifies the product.
    const ors = scope.categoryIds.map((id) => `category_ids = ${quote(id)}`)
    clauses.push(ors.length === 1 ? ors[0] : `(${ors.join(" OR ")})`)
  }
  if (scope.collectionId) clauses.push(`collection_id = ${quote(scope.collectionId)}`)
  if (scope.brandHandle) clauses.push(`brand_handle = ${quote(scope.brandHandle)}`)

  if (filters.brand) {
    // `?brand=` may carry a handle (from the facet dropdown) or a name (legacy
    // links). Match either; both are indexed lowercased.
    const b = filters.brand.trim().toLowerCase()
    if (b) clauses.push(`(brand_handle = ${quote(b)} OR brand_name = ${quote(b)})`)
  }
  if (filters.typeId?.trim()) clauses.push(`type_id = ${quote(filters.typeId.trim())}`)
  if (filters.tagId?.trim()) clauses.push(`tag_ids = ${quote(filters.tagId.trim())}`)
  if (filters.fabric?.trim()) {
    // `fabric` is indexed as a token array; match the first word of the filter.
    const token = filters.fabric.trim().toLowerCase().split(/[^a-z0-9]+/)[0]
    if (token) clauses.push(`fabric = ${quote(token)}`)
  }
  if (filters.inStock) clauses.push(`in_stock = true`)
  // Filter values are whole dollars (UI); the index stores minor units (cents).
  if (typeof filters.minPrice === "number") {
    clauses.push(`min_price_aud >= ${Math.round(filters.minPrice * 100)}`)
  }
  if (typeof filters.maxPrice === "number") {
    clauses.push(`min_price_aud <= ${Math.round(filters.maxPrice * 100)}`)
  }

  return clauses
}

export async function searchListing(opts: {
  scope: ListingScope
  filters: ListingFilters
  sortBy: SortOptions
  page: number
  limit: number
}): Promise<{ ids: string[]; count: number } | null> {
  if (!LISTING_VIA_SEARCH_ENABLED) return null
  if (!SEARCH_ENDPOINT || !SEARCH_API_KEY) return null

  const { scope, filters, sortBy, page, limit } = opts
  const clauses = buildFilter(scope, filters)

  const body: Record<string, unknown> = {
    q: "",
    sort: SORT_MAP[sortBy] ?? SORT_MAP.created_at,
    // `page`/`hitsPerPage` (vs offset/limit) makes Meili return an exhaustive
    // `totalHits`, so the storefront pagination page-count is exact.
    page: Math.max(1, page),
    hitsPerPage: limit,
    attributesToRetrieve: ["id"],
  }
  if (clauses.length) body.filter = clauses.join(" AND ")

  try {
    const res = await fetch(
      `${SEARCH_ENDPOINT.replace(/\/$/, "")}/indexes/${SEARCH_INDEX_NAME}/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SEARCH_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(LISTING_SEARCH_TIMEOUT_MS),
      }
    )
    if (!res.ok) {
      // 400 here usually means the index predates the sortable/filterable
      // settings (flag flipped before reindex). Fall back to legacy.
      console.warn(
        `[listing-search] meili ${res.status}; falling back to legacy listing path`
      )
      return null
    }
    const data = (await res.json()) as {
      hits?: Array<{ id?: string }>
      totalHits?: number
    }
    const ids = (data.hits ?? [])
      .map((h) => h?.id)
      .filter((id): id is string => typeof id === "string")
    return { ids, count: typeof data.totalHits === "number" ? data.totalHits : ids.length }
  } catch (error) {
    console.warn("[listing-search] meili query failed:", (error as Error).message)
    return null
  }
}
