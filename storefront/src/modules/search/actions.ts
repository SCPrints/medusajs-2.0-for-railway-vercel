"use server"

import { SEARCH_INDEX_NAME, createSearchClient } from "@lib/search-client"

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
  // Fresh client per request. The previous module-level singleton survived
  // across reused Fluid Compute invocations and could get wedged into a stuck
  // state — symptom was /results/<q> hanging until Vercel returned 504. The
  // client-side modal already moved to per-mount construction (commit
  // fd6fdf42); the server action was missed.
  const client = createSearchClient()
  const queries = [{ params: { query }, indexName: SEARCH_INDEX_NAME }]

  let hits: Hits[] = []
  try {
    const { results } = (await Promise.race([
      client.search(queries),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`search timeout after ${SEARCH_TIMEOUT_MS}ms`)),
          SEARCH_TIMEOUT_MS
        )
      ),
    ])) as Record<string, any>
    hits = (results?.[0]?.hits ?? []) as Hits[]
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
