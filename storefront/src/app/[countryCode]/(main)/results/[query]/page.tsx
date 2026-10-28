import { Metadata } from "next"
import SearchResultsTemplate from "@modules/search/templates/search-results-template"

import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

export const metadata: Metadata = {
  title: "Search",
  description: "Explore all of our products.",
  // Internal search results — Google's guidance is to keep these out of the
  // index. Follow so the product links are still discovered.
  robots: { index: false, follow: true },
}

type Params = {
  params: Promise<{ query: string; countryCode: string }>
  searchParams: Promise<{
    sortBy?: SortOptions
    page?: string
    minPrice?: string
    maxPrice?: string
    brand?: string
    fabric?: string
    typeId?: string
  }>
}

const parsePositiveNumber = (value?: string) => {
  const parsed = Number(value)
  return value && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined
}

export default async function SearchResults({ params, searchParams }: Params) {
  const { query, countryCode } = await params
  const sp = await searchParams

  // Route params arrive still URL-encoded ("biz%20polo"); Meili needs the words.
  let decoded = query
  try {
    decoded = decodeURIComponent(query)
  } catch {
    // malformed escape — search the raw text
  }

  return (
    <SearchResultsTemplate
      query={decoded}
      sortBy={sp.sortBy}
      page={parsePositiveNumber(sp.page) || 1}
      countryCode={countryCode}
      filters={{
        minPrice: parsePositiveNumber(sp.minPrice),
        maxPrice: parsePositiveNumber(sp.maxPrice),
        brand: sp.brand?.trim() || undefined,
        fabric: sp.fabric?.trim() || undefined,
        typeId: sp.typeId?.trim() || undefined,
      }}
    />
  )
}
