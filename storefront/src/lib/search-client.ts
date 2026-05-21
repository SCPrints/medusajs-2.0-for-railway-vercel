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
 * Factory — creates a fresh InstantMeiliSearch client. The underlying
 * instantsearch.js machinery in `react-instantsearch-hooks-web@6` (deprecated)
 * holds stale state across mount/unmount cycles under React 19 AND across
 * reused Vercel Fluid Compute function invocations. Always construct a new
 * client per call site:
 *   - Client components: inside `useMemo` so each mount gets its own client.
 *   - Server actions: at the top of each action so each request gets its own.
 * Sharing a module-level singleton caused the search box to fail to render on
 * the second visit to `/search` (client-side) and `/results/<query>` to hang
 * until Vercel returned 504 (server-side).
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
