// Search talks to Meilisearch with plain fetch (search overlay, the
// `/results/[query]` server action and listing-via-search), so no search
// client library is needed.

// Medusa's Search Module rebuilds the index under a new name each time
// (`products_v1`, `products_v2`, …), so the backend says which one is live.
// Falls back to the bare name (the pre-Search-Module index) if it can't answer.
const FALLBACK_INDEX = process.env.NEXT_PUBLIC_INDEX_NAME || "products"
const TTL_MS = 60_000

let cached: { name: string; until: number } | null = null

export async function getProductIndexName(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.name

  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.replace(/\/$/, "")
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  let name = FALLBACK_INDEX
  let ttl = 10_000 // retry a failed lookup soon
  if (backend && key) {
    try {
      const res = await fetch(`${backend}/store/search-index`, {
        headers: { "x-publishable-api-key": key },
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      })
      if (res.ok) {
        const data = (await res.json()) as { products?: string }
        if (data.products) {
          name = data.products
          ttl = TTL_MS
        }
      }
    } catch {
      // fall through with the fallback name
    }
  }
  cached = { name, until: Date.now() + ttl }
  return name
}
