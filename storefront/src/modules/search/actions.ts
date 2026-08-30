"use server"

import { SEARCH_INDEX_NAME } from "@lib/search-client"

interface Hits {
  readonly objectID?: string
  id?: string
  [x: string | number | symbol]: unknown
}

/** Hard upper bound on the Meilisearch round-trip — keeps Vercel from
 * gateway-timing-out (504) and lets `/results/[query]` degrade to a clean
 * "No results" page if the search index is unreachable. */
const SEARCH_TIMEOUT_MS = 8000

/**
 * Uses MeiliSearch or Algolia to search for a query
 * @param {string} query - search query
 */
export async function search(query: string): Promise<Hits[]> {
  // Raw Meilisearch fetch (same pattern as the client search overlay). The
  // instant-meilisearch adapter this used previously could wedge across reused
  // Fluid Compute invocations AND its filter translation only supports
  // equality — we need `internal_service != true` to hide service products.
  const endpoint = process.env.NEXT_PUBLIC_SEARCH_ENDPOINT
  if (!endpoint) return []
  const apiKey = process.env.NEXT_PUBLIC_SEARCH_API_KEY || ""

  let hits: Hits[] = []
  try {
    const response = await fetch(
      new URL(`/indexes/${SEARCH_INDEX_NAME}/search`, endpoint).toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          q: query,
          limit: 50,
          // Hide internal service products (setup-fee lines) from results.
          filter: "internal_service != true",
        }),
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      }
    )
    if (!response.ok) {
      throw new Error(`search responded ${response.status}`)
    }
    const data = (await response.json()) as { hits?: Hits[] }
    hits = data.hits ?? []
  } catch (error) {
    console.warn("[search] meilisearch query failed:", (error as Error).message)
    // Fall through with empty hits so the page renders "No results" instead
    // of throwing a 500 / hitting the 504 gateway timeout.
  }

  // Fire-and-forget log of the search to the backend so the admin
  // Reports → Catalog & supply tab can surface top + zero-result
  // queries. Failures are swallowed — never break search UX.
  void logSearchEvent(query.trim(), hits.length)

  return hits
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
