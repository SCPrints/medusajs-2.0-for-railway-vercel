import { Suspense } from "react"

import { isRamoStoreBrand } from "@modules/brands/data/brands"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { ProductFilters } from "@modules/store/components/refinement-list/types"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  minPrice,
  maxPrice,
  inStock,
  brand,
  fabric,
  tag,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  brand?: string
  fabric?: string
  tag?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"
  const isRamo = isRamoStoreBrand(brand)
  const catalogTitle = isRamo ? "Ramo" : brand?.trim() ? brand.trim() : "All products"

  return (
    <div
      className="flex flex-col small:flex-row small:items-start small:gap-x-10 py-6 content-container"
      data-testid="category-container"
    >
      <RefinementList
        sortBy={sort}
        filters={{
          minPrice,
          maxPrice,
          inStock,
          brand,
          fabric,
        } as ProductFilters}
      />
      <div className="w-full">
        <div className="mb-8">
          <h1 className="page-title-catalog" data-testid="store-page-title">
            {catalogTitle}
          </h1>
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            minPrice={minPrice}
            maxPrice={maxPrice}
            inStock={inStock}
            brand={brand}
            fabric={fabric}
            tag={tag}
            countryCode={countryCode}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplate
