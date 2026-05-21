import { instantMeiliSearch } from "@meilisearch/instant-meilisearch"

const isBrowser = typeof window !== "undefined"

// In the browser, never fall back to loopback — a public HTTPS origin hitting
// 127.0.0.1 triggers Chrome's Local Network Access prompt. When the env var is
// missing client-side, point at same-origin (`/_disabled-search`) so the client
// silently returns empty results without asking for device permissions.
const endpoint =
  process.env.NEXT_PUBLIC_SEARCH_ENDPOINT ||
  (isBrowser ? "/_disabled-search" : "http://127.0.0.1:7700")

const apiKey = process.env.NEXT_PUBLIC_SEARCH_API_KEY || "test_key"

/**
 * Factory — creates a fresh InstantMeiliSearch client per call site.
 *
 * Now only consumed by the server action at `src/modules/search/actions.ts`
 * (which powers `/<cc>/results/[query]`). The client-side search modal moved
 * to a custom fetch implementation, so `instant-meilisearch` no longer ships
 * to the browser. We still build a new client per request because the
 * underlying instance can wedge into a stuck state across reused Vercel
 * Fluid Compute invocations — `/results/<q>` used to hang until Vercel
 * returned 504 when a singleton was reused.
 */
export const createSearchClient = () => instantMeiliSearch(endpoint, apiKey)

export const SEARCH_INDEX_NAME =
  process.env.NEXT_PUBLIC_INDEX_NAME || "products"

// If you want to use Algolia instead then uncomment the following lines, and delete the above lines
// you should also install algoliasearch - yarn add algoliasearch

// import algoliasearch from "algoliasearch/lite"

// const appId = process.env.NEXT_PUBLIC_SEARCH_APP_ID || "test_app_id"

// const apiKey = process.env.NEXT_PUBLIC_SEARCH_API_KEY || "test_key"

// export const searchClient = algoliasearch(appId, apiKey)

// export const SEARCH_INDEX_NAME =
//   process.env.NEXT_PUBLIC_INDEX_NAME || "products"
