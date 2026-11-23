// Search talks to Meilisearch with plain fetch (search overlay, the
// `/results/[query]` server action and listing-via-search), so no search
// client library is needed.

// Medusa's Search Module rebuilds the index under a new name each time
// (`products_v1`, `products_v2`, …), so the backend says which one is live.
// If the backend can't answer, reuse the last name it gave. The bare
// `products` fallback no longer exists on the live Meili (only `products_vN`),
// so it is a last resort, and a failed lookup is never cached: the next
// search asks again instead of sticking on a dead name.
const FALLBACK_INDEX = process.env.NEXT_PUBLIC_INDEX_NAME || "products"
const TTL_MS = 60_000

let cached: { name: string; until: number } | null = null
let lastGood: string | null = null

async function lookup(backend: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${backend}/store/search-index`, {
      headers: { "x-publishable-api-key": key },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { products?: string }
    return data.products || null
  } catch {
    return null
  }
}

export async function getProductIndexName(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.name

  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.replace(/\/$/, "")
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (backend && key) {
    const name = (await lookup(backend, key)) ?? (await lookup(backend, key)) // one retry
    if (name) {
      lastGood = name
      cached = { name, until: Date.now() + TTL_MS }
      return name
    }
  }
  return lastGood ?? FALLBACK_INDEX
}

/** Test hook: forget cached names. */
export function resetProductIndexNameCache() {
  cached = null
  lastGood = null
}
