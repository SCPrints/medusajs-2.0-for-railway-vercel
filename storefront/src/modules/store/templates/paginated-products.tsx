import { HttpTypes } from "@medusajs/types"

import { getProductsListWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
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

  const resolvedTagId = tagId?.trim() || tag?.trim()
  if (resolvedTagId) {
    queryParams.tag_id = [resolvedTagId]
  }

  const trimmedTypeId = typeId?.trim()
  if (trimmedTypeId) {
    queryParams.type_id = [trimmedTypeId]
  }

  if (sortBy === "created_at") {
    /** Descending (newest first), aligned with client-side sort in `sort-products.ts` */
    queryParams["order"] = "-created_at"
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  let {
    response: { products, count },
  } = await getProductsListWithSort({
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
  })

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
              <ProductPreview product={p} region={region} layout="boxed" />
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
