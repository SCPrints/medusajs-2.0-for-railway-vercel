"use server"

import {
  searchProducts,
  type ListingFilters,
  type ProductSearchResult,
} from "@lib/data/listing-search"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

/**
 * Search results for `/results/[query]`: relevance, filters, sort and paging
 * run in Meilisearch (see `searchProducts`). Returns an empty result if the
 * index is unreachable so the page renders "No results" instead of a 500.
 */
export async function search(
  query: string,
  opts: { filters?: ListingFilters; sortBy?: SortOptions; page?: number; limit?: number } = {}
): Promise<ProductSearchResult> {
  const result =
    (await searchProducts({
      q: query,
      filters: opts.filters ?? {},
      sortBy: opts.sortBy ?? "created_at",
      page: opts.page ?? 1,
      limit: opts.limit ?? 12,
    })) ?? { ids: [], count: 0, brandCounts: {}, typeCounts: {} }

  // Fire-and-forget log of the search to the backend so the admin
  // Reports → Catalog & supply tab can surface top + zero-result
  // queries. Only unfiltered first pages count as a search.
  const filtered = Object.values(opts.filters ?? {}).some((v) => v !== undefined && v !== "")
  if ((opts.page ?? 1) === 1 && !filtered) void logSearchEvent(query.trim(), result.count)

  return result
}

const logSearchEvent = async (query: string, resultsCount: number) => {
  if (!query) return
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.replace(
    /\/$/,
    ""
  )
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (!backendUrl || !publishableKey) return

  try {
    await fetch(`${backendUrl}/store/search-events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({
        query,
        results_count: resultsCount,
      }),
      // Server-action context — keep the request short so it doesn't
      // hold up the response.
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // intentional silent
  }
}
