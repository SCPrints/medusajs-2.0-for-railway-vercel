import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { TREE } from "../../../../lib/shop-categories"

/**
 * GET /store/shop-categories/menu
 *
 * Returns the mega-menu's ready-to-render category tree:
 *   - Audiences in TREE order (mens, womens, kids, workwear, corporates,
 *     healthcare, accessories, spirits)
 *   - Sub-categories under each audience that meet ALL of:
 *       a. product_count > 0 (published products only)
 *       b. metadata.is_hidden_from_menu !== true
 *       c. is_active !== false on the category row
 *   - Audiences with zero populated subs are dropped entirely (no
 *     dropdown trigger for an empty audience).
 *   - Names come from the DB (respects admin renames) and fall back to
 *     the TREE label if the row is missing.
 *
 * Public store endpoint — no auth required. Storefront caches this
 * aggressively via Next's `revalidate` so the menu doesn't burn a DB
 * sweep per page load. Empties self-disappear as data improves; staff
 * never need to manually prune dead menu links.
 */

type CategoryRow = {
  id: string
  name: string
  handle: string
  is_active: boolean
  metadata: Record<string, unknown> | null
}

// ──────────────────────────────────────────────────────────────────────
// In-process cache + request coalescing
//
// This route is hit on every storefront page render (it powers the
// mega-menu). Counts come from one SQL GROUP BY: until 2026-11-25 the
// build swept every product through query.graph (10k rows hydrated in
// JS), which blocked the event loop ~33s per rebuild — the Fly health
// check failed and every request on the machine stalled, about every
// 15 minutes (first seen 2026-05-25).
//
// Two layers of mitigation:
//   1. Module-level cache: serves the last-built payload for 5 min.
//   2. Single in-flight promise: when the cache is cold and multiple
//      requests arrive, only ONE runs the build; the others await the
//      same promise. Without this, every concurrent cold request kicks
//      off its own graph queries.
//
// Per-machine state — 4 Fly machines = 4 caches; the first request on
// each machine is still cold. To centralise we'd need Redis, which is
// available (sc-prints-redis.internal) but adds a network round-trip
// to the hot path. In-memory + Cache-Control header to Vercel's fetch
// cache covers the common case cleanly.
//
// Cache busting: 5 min is acceptable lag for menu changes (admin
// renames, hide-toggle, new-product imports). Increase if menu edits
// are rare; decrease if staff complain about visible lag.
// ──────────────────────────────────────────────────────────────────────
const MENU_CACHE_TTL_MS = 5 * 60 * 1000

type MenuPayload = { audiences: unknown[] }
let menuCache: { exp: number; payload: MenuPayload } | null = null
let menuInFlight: Promise<MenuPayload> | null = null

async function buildMenuPayload(query: any, pg: any): Promise<MenuPayload> {
  // 1. Load every product_category row so we can look up by handle and
  //    pick up admin overrides (renames, hide-from-menu toggle).
  const { data: categoryRows } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle", "is_active", "metadata"],
  })
  const categoriesByHandle = new Map<string, CategoryRow>()
  for (const c of (categoryRows ?? []) as CategoryRow[]) {
    if (c.handle) categoriesByHandle.set(c.handle, c)
  }

  // 2. Published products per category handle, counted in Postgres.
  const countRows = (await pg("product_category_product")
    .join("product", "product.id", "product_category_product.product_id")
    .join(
      "product_category",
      "product_category.id",
      "product_category_product.product_category_id"
    )
    .where("product.status", "published")
    .whereNull("product.deleted_at")
    .whereNull("product_category.deleted_at")
    .groupBy("product_category.handle")
    .select("product_category.handle as handle")
    .count("product.id as count")) as Array<{ handle: string; count: string | number }>
  const countsByHandle = new Map<string, number>(
    countRows.map((r) => [r.handle, Number(r.count)])
  )

  // 3. Walk the TREE and build the response. Filters compose in one place
  //    so the storefront can render naively (anything that comes back is
  //    visible).
  const audiences = TREE.map((audience) => {
    const audienceRow = categoriesByHandle.get(audience.handle)
    const audienceHidden =
      (audienceRow?.metadata?.is_hidden_from_menu as boolean | undefined) ??
      false
    const audienceActive = audienceRow?.is_active ?? true

    const visibleSubs = audience.children
      .map((sub) => {
        const fullHandle = `${audience.handle}-${sub.handle}`
        const row = categoriesByHandle.get(fullHandle)
        const count = countsByHandle.get(fullHandle) ?? 0
        const hidden =
          (row?.metadata?.is_hidden_from_menu as boolean | undefined) ?? false
        const active = row?.is_active ?? true
        return {
          handle: fullHandle,
          sub_handle: sub.handle,
          name: row?.name ?? sub.name,
          product_count: count,
          _active: active,
          _hidden: hidden,
        }
      })
      .filter((s) => s._active && !s._hidden && s.product_count > 0)
      .map(({ handle, sub_handle, name, product_count }) => ({
        handle,
        sub_handle,
        name,
        product_count,
      }))

    if (!audienceActive || audienceHidden || visibleSubs.length === 0) {
      return null
    }

    return {
      handle: audience.handle,
      name: audienceRow?.name ?? audience.name,
      total_products: visibleSubs.reduce(
        (sum, s) => sum + s.product_count,
        0
      ),
      subs: visibleSubs,
    }
  }).filter((a): a is NonNullable<typeof a> => a !== null)

  return { audiences }
}

function setMenuCacheHeaders(res: MedusaResponse) {
  // Vercel's fetch cache + any intermediate CDN can hold for 5 min and
  // serve stale for an additional 10 min while a background refresh runs.
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=600"
  )
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cached = menuCache && menuCache.exp > Date.now() ? menuCache.payload : null
  if (cached) {
    setMenuCacheHeaders(res)
    res.json(cached)
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  if (!menuInFlight) {
    menuInFlight = (async () => {
      try {
        const payload = await buildMenuPayload(query, pg)
        menuCache = { exp: Date.now() + MENU_CACHE_TTL_MS, payload }
        return payload
      } finally {
        menuInFlight = null
      }
    })()
  }

  const payload = await menuInFlight
  setMenuCacheHeaders(res)
  res.json(payload)
}
