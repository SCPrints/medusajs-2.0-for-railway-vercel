import { NextResponse } from "next/server"

import { listBrands } from "@lib/data/brands"
import {
  listStoreProductTags,
  listStoreProductTypes,
} from "@lib/data/catalog-facets"
import { listShopCategoriesMenu } from "@lib/data/shop-categories-menu"

/**
 * Background cache warmer — hits the slow catalog facet endpoints so the
 * Next.js `"use cache"` entries stay populated.
 *
 * Why this exists:
 *   The catalog facet data layer (tags, types, brands, shop categories) is
 *   cached with `stale: 86400` so users get an instant response and refresh
 *   happens in the background. But the cache entries DO eventually expire —
 *   `expire: 86400`. If 24h pass with no traffic to a page that uses these
 *   functions, the next user hits a cold-cache 4-second wait while the
 *   underlying backend query runs.
 *
 *   A Vercel cron hitting this route every 30 minutes keeps the entries
 *   permanently warm. Worst case any single user pays is `stale` latency
 *   (~100ms) plus the background refresh which they never see.
 *
 * What it warms:
 *   - listStoreProductTags + listStoreProductTypes — used by every PLP
 *     for filter dropdowns. The big win: tags fetch is ~0.1s after the
 *     payload-trim fix, but its cache entry is the most frequently
 *     accessed.
 *   - listBrands — used in nav + every PLP.
 *   - listShopCategoriesMenu — used in nav on every page.
 *
 * Auth:
 *   Vercel cron requests include `Authorization: Bearer ${CRON_SECRET}`.
 *   Manual hits (e.g. for debugging) work too — the warmer is read-only
 *   and idempotent; worst case a curious user warms the cache for us.
 *
 * Schedule:
 *   Configured in vercel.json. Cron-friendly: runs in ~1 second when
 *   all caches are warm, ~5 seconds on a true cold cache.
 */
export async function GET() {
  const start = Date.now()
  const results = await Promise.allSettled([
    listStoreProductTags(),
    listStoreProductTypes(),
    listBrands(),
    listShopCategoriesMenu(),
  ])

  const summary = {
    elapsedMs: Date.now() - start,
    tags: results[0].status === "fulfilled" ? results[0].value.length : "error",
    types: results[1].status === "fulfilled" ? results[1].value.length : "error",
    brands: results[2].status === "fulfilled" ? results[2].value.length : "error",
    categoriesMenu:
      results[3].status === "fulfilled" ? results[3].value.length : "error",
    errors: results
      .map((r, i) => (r.status === "rejected" ? `${i}: ${r.reason}` : null))
      .filter(Boolean),
  }

  return NextResponse.json(summary)
}
