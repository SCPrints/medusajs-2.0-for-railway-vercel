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

type ProductRow = {
  id: string
  status: string | null
  categories: Array<{ id: string; handle: string }> | null
}

type CategoryRow = {
  id: string
  name: string
  handle: string
  is_active: boolean
  metadata: Record<string, unknown> | null
}

const MAX_PRODUCTS = 10000

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

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

  // 2. Single sweep over published products to count category memberships.
  //    Same approach as /admin/shop-categories/health — cheap because
  //    Medusa's graph layer pulls categories.handle as a join in one query.
  const { data: productRows } = await query.graph({
    entity: "product",
    fields: ["id", "status", "categories.handle"],
    pagination: { take: MAX_PRODUCTS, skip: 0 },
  })

  const countsByHandle = new Map<string, number>()
  for (const product of (productRows ?? []) as ProductRow[]) {
    if ((product.status ?? "") !== "published") continue
    for (const cat of product.categories ?? []) {
      if (!cat.handle) continue
      countsByHandle.set(
        cat.handle,
        (countsByHandle.get(cat.handle) ?? 0) + 1
      )
    }
  }

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

  res.json({ audiences })
}
