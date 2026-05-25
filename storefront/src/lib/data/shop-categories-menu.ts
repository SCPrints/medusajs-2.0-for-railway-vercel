import { MEDUSA_BACKEND_URL } from "@lib/config"
import { cacheLife, cacheTag } from "next/cache"

/**
 * Storefront fetcher for the mega-menu's category tree.
 *
 * Hits `GET /store/shop-categories/menu` on the backend, which returns
 * the audience × sub-category tree pre-filtered to:
 *   - product_count > 0 (only categories with published products)
 *   - metadata.is_hidden_from_menu !== true (respects admin hide toggle)
 *   - is_active !== false
 *
 * Empty audiences (no populated subs) are dropped server-side too, so
 * we never render a dead trigger.
 *
 * Caching: 10 min revalidate, 1 day expire — same window as `listBrands()`
 * and `listCategories()`. Invalidated via the `categories` tag if the
 * backend ever wants to push an update.
 */

export type MenuSub = {
  /** Full handle, e.g. `mens-t-shirts`. Links go to /categories/<handle>. */
  handle: string
  /** Sub portion only, e.g. `t-shirts`. Useful for cluster grouping client-side. */
  sub_handle: string
  /** Display label (DB row's `name`, falls back to TREE label). */
  name: string
  product_count: number
}

export type MenuAudience = {
  /** Top-level audience handle, e.g. `mens`. Maps to /categories/<handle>. */
  handle: string
  name: string
  total_products: number
  subs: MenuSub[]
}

type MenuResponse = {
  audiences: MenuAudience[]
}

const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

function menuHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" }
  if (publishableKey) h["x-publishable-api-key"] = publishableKey
  return h
}

export async function listShopCategoriesMenu(): Promise<MenuAudience[]> {
  "use cache"
  cacheTag("categories", "shop-categories-menu")
  cacheLife({ revalidate: 600, stale: 600, expire: 86400 })
  try {
    // Belt-and-braces: pass `next.revalidate` on the fetch so Vercel's
    // request-level fetch cache also holds the response. The outer
    // `"use cache"` directive should be enough in steady state, but it's
    // per-function-output and can stampede on cold start across multiple
    // Vercel function instances. Adding the fetch-level cache means each
    // instance does at most one backend call per 10-min window even before
    // its "use cache" entry is populated.
    const res = await fetch(`${MEDUSA_BACKEND_URL}/store/shop-categories/menu`, {
      headers: menuHeaders(),
      next: { revalidate: 600, tags: ["categories", "shop-categories-menu"] },
    })
    if (!res.ok) return []
    const data = (await res.json()) as MenuResponse
    return data.audiences ?? []
  } catch {
    return []
  }
}
