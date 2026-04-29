import { Suspense } from "react"

import { listStoreProductTags, listStoreProductTypes } from "@lib/data/catalog-facets"
import AsColourStoreUgcMasonry from "@modules/brands/components/as-colour-store-ugc-masonry"
import { BRAND_TILES, isAsColourStoreBrand, isRamoStoreBrand } from "@modules/brands/data/brands"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { CatalogFacetOptions, ProductFilters } from "@modules/store/components/refinement-list/types"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = async ({
  sortBy,
  page,
  minPrice,
  maxPrice,
  inStock,
  brand,
  fabric,
  typeId,
  tagId,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  brand?: string
  fabric?: string
  typeId?: string
  tagId?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"
  const isRamo = isRamoStoreBrand(brand)
  const isAsColour = isAsColourStoreBrand(brand)
  const catalogTitle = isRamo ? "Ramo" : brand?.trim() ? brand.trim() : "All products"

  const [productTypes, productTags] = await Promise.all([
    listStoreProductTypes(),
    listStoreProductTags(),
  ])

  const facetOptions: CatalogFacetOptions = {
    brands: BRAND_TILES.map((t) => ({
      id: t.storeQuery ?? t.name,
      label: t.name,
    })),
    types: productTypes.map((pt) => ({
      id: pt.id,
      label: pt.value ?? pt.id,
    })),
    tags: productTags.map((tg) => ({
      id: tg.id,
      label: tg.value ?? tg.id,
    })),
  }

  return (
    <div
      className="flex flex-col small:flex-row small:items-start small:gap-x-10 py-6 content-container"
      data-testid="category-container"
    >
      <RefinementList
        sortBy={sort}
        facetOptions={facetOptions}
        filters={
          {
            minPrice,
            maxPrice,
            inStock,
            brand,
            fabric,
            typeId,
            tagId,
          } as ProductFilters
        }
      />
      <div className="w-full">
        <div className="mb-8">
          <h1 className="page-title-catalog" data-testid="store-page-title">
            {catalogTitle}
          </h1>
        </div>
        {isAsColour && pageNumber === 1 ? <AsColourStoreUgcMasonry /> : null}
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            minPrice={minPrice}
            maxPrice={maxPrice}
            inStock={inStock}
            brand={brand}
            fabric={fabric}
            tagId={tagId}
            typeId={typeId}
            countryCode={countryCode}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplate
