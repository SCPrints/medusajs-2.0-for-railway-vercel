import { HttpTypes } from "@medusajs/types"

import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { getCustomerTier } from "@lib/data/customer-tier"
import { listStoreProductTags } from "@lib/data/catalog-facets"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { ProductFilters } from "@modules/store/components/refinement-list/types"

const PRODUCT_LIMIT = 12

export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  brandHandle,
  productsIds,
  minPrice,
  maxPrice,
  inStock,
  brand,
  fabric,
  /** Prefer over legacy `tag` (Medusa Store API uses tag IDs). */
  tagId,
  /** @deprecated Use `tagId`; kept for bookmarks using `?tag=`. */
  tag,
  typeId,
  countryCode,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  /**
   * Brand handle for the dedicated brand-products endpoint. When set, the underlying
   * data layer fetches via `/store/brands/<handle>/products` (paginated, sales-channel
   * scoped, with proper pricing). The right shape for brand listings — the old
   * `productsIds` approach broke for big brands because passing hundreds of UUIDs in
   * the URL exceeded proxy length limits.
   */
  brandHandle?: string
  /**
   * Explicit product ID allowlist. Used by Meilisearch results (bounded to a small page
   * of IDs). Do NOT use for brand pages — use `brandHandle` instead.
   */
  productsIds?: string[]
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  brand?: string
  fabric?: string
  tagId?: string
  tag?: string
  typeId?: string
  countryCode: string
}) {
  const queryParams: HttpTypes.StoreProductListParams = {
    limit: PRODUCT_LIMIT,
  }

  if (collectionId) {
    queryParams.collection_id = [collectionId]
  }

  if (categoryId) {
    queryParams.category_id = [categoryId]
  }

  if (productsIds) {
    queryParams.id = productsIds
  }

  // Prefer explicit tagId; otherwise resolve the legacy `?tag=<value>` (e.g. "pants")
  // to a real Medusa tag ID by looking it up in the cached tag list.
  let resolvedTagId = tagId?.trim() || undefined
  const legacyTagValue = tag?.trim()
  if (!resolvedTagId && legacyTagValue) {
    const lookup = legacyTagValue.toLowerCase()
    const tags = await listStoreProductTags()
    resolvedTagId = tags.find((t) => (t.value ?? "").toLowerCase() === lookup)?.id
  }
  if (resolvedTagId) {
    queryParams.tag_id = [resolvedTagId]
  } else if (legacyTagValue) {
    // Unknown tag value → return zero results rather than the full catalog.
    queryParams.id = ["__no_match__"]
  }

  const trimmedTypeId = typeId?.trim()
  if (trimmedTypeId) {
    queryParams.type_id = [trimmedTypeId]
  }

  // The Medusa `order` param for column-backed sorts (created_at, title) is
  // derived inside `getProductsListWithSort`; price sorts use its in-memory scan.

  // Parallelise the region lookup, products fetch, AND customer-tier lookup
  // at this level — `getCustomerTier()` was previously called once per
  // ProductPreview (× 12 tiles per page) inside their own Promise.all blocks.
  // Even though it's React.cache-deduped (one real fetch per request), each
  // tile still awaited the resolved promise, adding ~30-50ms of scheduling
  // overhead per tile = ~400ms total. Resolving it once here and passing
  // the result down keeps the per-tile render pure-sync after data lands.
  // `getProductsListWithSort` internally calls `getRegion(countryCode)` again,
  // but that call is cached (`cacheLife: 3600` on the regions module) so
  // the second invocation is free.
  const [region, productsResult, tier] = await Promise.all([
    getRegion(countryCode),
    getProductsListWithSort({
      page,
      queryParams,
      sortBy,
      filters: {
        minPrice,
        maxPrice,
        inStock,
        brand,
        fabric,
      } as ProductFilters,
      countryCode,
      brandHandle,
    }),
    getCustomerTier(),
  ])

  if (!region) {
    return null
  }

  const {
    response: { products, count },
  } = productsResult

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  return (
    <>
      <ul
        className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-10 medium:gap-x-8"
        data-testid="products-list"
      >
        {products.map((p) => {
          return (
            <li key={p.id} className="h-full">
              <ProductPreview
                product={p}
                region={region}
                layout="boxed"
                tier={tier}
              />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}
