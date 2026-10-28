import { Heading, Text } from "@medusajs/ui"

import { listBrands } from "@lib/data/brands"
import { listStoreProductTypes } from "@lib/data/catalog-facets"
import { getCustomerTier } from "@lib/data/customer-tier"
import { hydrateRankedProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"
import { search } from "@modules/search/actions"
import { Pagination } from "@modules/store/components/pagination"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import {
  CatalogFacetOptions,
  ProductFilters,
} from "@modules/store/components/refinement-list/types"

const PRODUCT_LIMIT = 12

type SearchResultsTemplateProps = {
  query: string
  sortBy?: SortOptions
  page: number
  countryCode: string
  filters: ProductFilters
}

const SearchResultsTemplate = async ({
  query,
  sortBy = "created_at",
  page,
  countryCode,
  filters,
}: SearchResultsTemplateProps) => {
  const [result, brands, types, region, tier] = await Promise.all([
    search(query, { filters, sortBy, page, limit: PRODUCT_LIMIT }),
    listBrands(),
    listStoreProductTypes(),
    getRegion(countryCode),
    getCustomerTier(),
  ])
  const products = (await hydrateRankedProducts(result.ids, countryCode)) ?? []
  const totalPages = Math.ceil(result.count / PRODUCT_LIMIT)
  const hasFilters = Object.values(filters).some((v) => v !== undefined)

  // Dropdowns only offer brands/types present in these results, with counts.
  const withCount = (label: string, n: number) => `${label} (${n})`
  const facetOptions: CatalogFacetOptions = {
    brands: brands
      .filter((b) => result.brandCounts[b.handle])
      .sort((a, b) => result.brandCounts[b.handle] - result.brandCounts[a.handle])
      .map((b) => ({ id: b.handle, label: withCount(b.name, result.brandCounts[b.handle]) })),
    types: types
      .filter((t) => result.typeCounts[t.id])
      .sort((a, b) => result.typeCounts[b.id] - result.typeCounts[a.id])
      .map((t) => ({ id: t.id, label: withCount(t.value ?? t.id, result.typeCounts[t.id]) })),
    tags: [],
  }

  return (
    <>
      <div className="flex justify-between border-b w-full py-6 px-8 small:px-14 items-center">
        <div className="flex flex-col items-start">
          <Text className="text-ui-fg-muted">Search Results for:</Text>
          <Heading>
            {query} ({result.count})
          </Heading>
        </div>
        <LocalizedClientLink
          href="/store"
          className="txt-medium text-ui-fg-subtle hover:text-ui-fg-base"
        >
          Clear
        </LocalizedClientLink>
      </div>
      <div className="flex flex-col small:flex-row small:items-start p-6">
        {result.count > 0 || hasFilters ? (
          <>
            <RefinementList
              sortBy={sortBy}
              filters={filters}
              facetOptions={facetOptions}
              search
            />
            <div className="content-container">
              {products.length > 0 && region ? (
                <>
                  <ul
                    className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-10 medium:gap-x-8"
                    data-testid="products-list"
                  >
                    {products.map((p, index) => (
                      <li key={p.id} className="h-full">
                        <ProductPreview
                          product={p}
                          region={region}
                          layout="boxed"
                          tier={tier}
                          imagePriority={index < 4}
                        />
                      </li>
                    ))}
                  </ul>
                  {totalPages > 1 && (
                    <Pagination
                      data-testid="product-pagination"
                      page={page}
                      totalPages={totalPages}
                    />
                  )}
                </>
              ) : (
                <Text className="mt-3">No products match these filters.</Text>
              )}
            </div>
          </>
        ) : (
          <Text className="ml-8 small:ml-14 mt-3">No results.</Text>
        )}
      </div>
    </>
  )
}

export default SearchResultsTemplate
