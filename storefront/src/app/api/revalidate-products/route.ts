import { revalidateTag } from "next/cache"
import { type NextRequest, NextResponse } from "next/server"
import { safeEqual } from "@lib/util/api-guard"

/**
 * On-demand cache purge for storefront tag-based caches.
 *
 * Backend subscribers / mutating routes POST here with the tags to invalidate:
 *   curl -X POST "https://<storefront>/api/revalidate-products" \
 *     -H "Authorization: Bearer <REVALIDATE_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"tags":["products","product-as-colour-1000"]}'
 *
 * No body / empty tags array purges the full catalog (back-compat for the
 * existing manual usage from import scripts that just nuke everything).
 *
 * Tags used by the storefront's `'use cache'` fetchers (see `src/lib/data/`):
 *   products, product-{handle}        — getProductByHandle, getProductsById, getProductsList, getProductsListWithSort
 *   brands, brand-{handle}            — listBrands, retrieveBrandByHandle, getBrandProducts
 *   categories, category-{path}       — listCategories, getCategoryByHandle
 *   collections, collection-{handle}  — getCollectionsList, retrieveCollection, getCollectionByHandle
 *   regions, region-{id}              — listRegions, retrieveRegion
 *   instagram                         — getInstagramFeedMedia
 *   home-featured                     — getHomeFeaturedRangeProducts
 *   graph                             — /store/graph store route (separate from the SDK fetchers)
 *   top-selling-products              — Nav best-seller fetch
 */
const DEFAULT_TAGS = [
  "products",
  "brands",
  "categories",
  "collections",
  "instagram",
  "home-featured",
  "graph",
  "top-selling-products",
] as const

/** Cap to stop a buggy/malicious caller from queueing thousands of purges. */
const MAX_TAGS_PER_REQUEST = 50

function parseTags(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null
  const raw = (body as { tags?: unknown }).tags
  if (!Array.isArray(raw)) return null
  const tags = raw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim())
  return Array.from(new Set(tags)).slice(0, MAX_TAGS_PER_REQUEST)
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET
  if (!expected?.trim()) {
    return NextResponse.json(
      { message: "REVALIDATE_SECRET is not set on the storefront" },
      { status: 503 }
    )
  }

  // Header-only: a `?secret=` query param leaks into access logs, proxies,
  // Referer headers and browser history — so we no longer accept it.
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim()

  if (!bearer || !safeEqual(bearer, expected)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    /* no body / not JSON — falls back to default tags below */
  }

  const requested = parseTags(body)
  const tags = requested?.length ? requested : [...DEFAULT_TAGS]

  for (const tag of tags) {
    // Next 16 made the second arg required. "max" preserves v15 semantics
    // (purge immediately). `updateTag` is the alternative but only allowed
    // inside Server Actions, not route handlers.
    revalidateTag(tag, "max")
  }

  return NextResponse.json({ revalidated: true, tags })
}
