// Search talks to Meilisearch with plain fetch (search overlay + the
// `/results/[query]` server action), so no search client library is needed.
export const SEARCH_INDEX_NAME =
  process.env.NEXT_PUBLIC_INDEX_NAME || "products"
