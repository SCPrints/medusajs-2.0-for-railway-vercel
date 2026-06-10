import { sdk } from "@lib/config"
import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"

export type LookbookItem = {
  id: string
  title: string
  description: string | null
  image_url: string
  attribution: string | null
  tags: string[]
  product_ids: string[]
}

export type LookbookPage = {
  items: LookbookItem[]
  /** Total published tiles (across all pages). */
  count: number
  /** Page size used for the query. */
  limit: number
  /** Global tag universe across all published tiles (stable across pages). */
  tags: string[]
}

/**
 * Cached fetch, no error handling — errors must THROW here so a transient
 * backend failure is never stored in the cache for the whole revalidate
 * window. The public wrappers below catch.
 *
 * Staff edits in admin show within `revalidate` (10 min). If instant
 * freshness is ever needed, fire `revalidateTag("lookbook")` from the admin
 * lookbook CRUD routes via the existing /api/revalidate-products endpoint.
 */
async function fetchLookbookPage(
  page: number,
  limit: number
): Promise<LookbookPage> {
  "use cache"
  cacheTag("lookbook")
  cacheLife({ revalidate: 600, stale: 86400, expire: 86400 })
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const offset = (safePage - 1) * limit
  const res = (await sdk.client.fetch("/store/lookbook", {
    query: { limit, offset },
  })) as {
    items?: LookbookItem[]
    count?: number
    limit?: number
    tags?: string[]
  }
  return {
    items: res.items ?? [],
    count: res.count ?? 0,
    limit: res.limit ?? limit,
    tags: res.tags ?? [],
  }
}

export async function getLookbookPage(
  page = 1,
  limit = 24
): Promise<LookbookPage> {
  try {
    return await fetchLookbookPage(page, limit)
  } catch {
    return { items: [], count: 0, limit, tags: [] }
  }
}

// Fisher–Yates shuffle.
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pool the home rail rotates over. One CACHED round-trip instead of the old
 * 1-2 sequential uncached fetches per home render (which kept the home page
 * blocked on the Fly backend every view). Trade-off: rotation now cycles
 * within the first `HOME_RAIL_POOL_SIZE` tiles (weight order) rather than the
 * entire lookbook — widen the pool if the lookbook outgrows it.
 */
const HOME_RAIL_POOL_SIZE = 48

export async function getLookbookPool(): Promise<LookbookItem[]> {
  try {
    const page = await fetchLookbookPage(1, HOME_RAIL_POOL_SIZE)
    return page.items
  } catch {
    return []
  }
}

// Home "Our recent work" rail. The randomisation stays OUTSIDE the cached
// function (Math.random inside "use cache" would freeze one shuffle for the
// whole revalidate window) — each render shuffles the cached pool.
export async function getLookbookHomeRail(
  limit = 8
): Promise<LookbookItem[]> {
  // Per-request randomness is intentional: `connection()` tells the PPR
  // prerenderer this runs at request time (inside the section's Suspense
  // boundary), otherwise the build rejects Math.random() after cached-only
  // data access ("next-prerender-random").
  await connection()
  const pool = await getLookbookPool()
  return shuffle(pool).slice(0, limit)
}
