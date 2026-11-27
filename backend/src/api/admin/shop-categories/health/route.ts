import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { TREE } from "../../../../lib/shop-categories"

/**
 * GET /admin/shop-categories/health
 *
 * For every category in the Shop tree (audience × sub) defined in
 * [backend/src/lib/shop-categories.ts](backend/src/lib/shop-categories.ts),
 * return the count of *published* products currently linked to it,
 * plus a small sample for staff to spot-check.
 *
 * Powers the `/app/shop-categories` admin page, which is the diagnostic
 * gate before any data fix: the existing `/admin/taxonomy-audit` route
 * surfaces *products* with gaps, but never tells staff which *categories*
 * have zero products (i.e. which mega-menu links go to empty pages).
 *
 * Implementation: one SQL read of published products and their category
 * handles, then bucket by handle. It used to sweep every product through
 * query.graph, which blocked the event loop for over a minute (27 Nov 2026:
 * 64 s, failed health check, every request queued), the same cause as the
 * 25 Nov shop-menu freeze.
 */

type ProductRow = {
  id: string
  title: string | null
  handle: string | null
  status: string | null
  categories: Array<{ handle: string }> | null
}

type SampleEntry = {
  id: string
  title: string
  handle: string
}

type CategoryNode = {
  /** Full handle, e.g. `mens-t-shirts`. Matches what's in the DB. */
  handle: string
  /** Sub component only, e.g. `t-shirts`. */
  sub_handle: string
  /** Human label, e.g. `T-Shirts`. */
  name: string
  product_count: number
  sample: SampleEntry[]
}

type AudienceNode = {
  handle: string
  name: string
  /** Sum of product_count across subs. A product cross-listed in two
   *  subs of the same audience is counted twice — this is intentional,
   *  it shows the audience's surface area, not its unique product count. */
  product_count: number
  subs: CategoryNode[]
}

type HealthResponse = {
  audiences: AudienceNode[]
  summary: {
    total_published_products: number
    products_without_shop_category: number
    orphan_sample: SampleEntry[]
    total_categories: number
    populated_categories: number
    empty_categories: number
    capped: boolean
    total_count_in_db: number | null
  }
}

const SAMPLE_LIMIT = 3
const ORPHAN_SAMPLE_LIMIT = 25

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  const linkRows = (await pg("product")
    .leftJoin("product_category_product", "product_category_product.product_id", "product.id")
    .leftJoin("product_category", "product_category.id", "product_category_product.product_category_id")
    .where("product.status", "published")
    .whereNull("product.deleted_at")
    .orderBy("product.id")
    .select(
      "product.id as id",
      "product.title as title",
      "product.handle as handle",
      "product_category.handle as category_handle",
      "product_category.deleted_at as category_deleted_at"
    )) as Array<{
    id: string
    title: string | null
    handle: string | null
    category_handle: string | null
    category_deleted_at: string | null
  }>
  const totalRow = (await pg("product").whereNull("deleted_at").count("id as count").first()) as
    | { count?: string | number }
    | undefined

  const byId = new Map<string, ProductRow>()
  for (const r of linkRows) {
    let p = byId.get(r.id)
    if (!p) {
      p = { id: r.id, title: r.title, handle: r.handle, status: "published", categories: [] }
      byId.set(r.id, p)
    }
    if (r.category_handle && !r.category_deleted_at) p.categories!.push({ handle: r.category_handle })
  }
  const rows = Array.from(byId.values())

  // Pre-build empty buckets matching TREE so categories with zero
  // products still appear in the response (that's the whole point).
  type Bucket = {
    audience: string
    sub_handle: string
    name: string
    count: number
    sample: SampleEntry[]
  }
  const buckets = new Map<string, Bucket>()
  for (const audience of TREE) {
    for (const sub of audience.children) {
      const fullHandle = `${audience.handle}-${sub.handle}`
      buckets.set(fullHandle, {
        audience: audience.handle,
        sub_handle: sub.handle,
        name: sub.name,
        count: 0,
        sample: [],
      })
    }
  }

  let publishedTotal = 0
  let productsWithoutShopCategory = 0
  const orphanSample: SampleEntry[] = []

  for (const product of rows) {
    if ((product.status ?? "") !== "published") continue
    publishedTotal++

    const sample: SampleEntry = {
      id: product.id,
      title: product.title ?? "(no title)",
      handle: product.handle ?? "",
    }

    const categoryHandles = (product.categories ?? []).map((c) => c.handle)
    let inShopCategory = false

    for (const handle of categoryHandles) {
      const bucket = buckets.get(handle)
      if (!bucket) continue
      bucket.count++
      inShopCategory = true
      if (bucket.sample.length < SAMPLE_LIMIT) bucket.sample.push(sample)
    }

    if (!inShopCategory) {
      productsWithoutShopCategory++
      if (orphanSample.length < ORPHAN_SAMPLE_LIMIT) orphanSample.push(sample)
    }
  }

  // Re-shape into TREE order so the response is stable + the UI doesn't
  // need to know the structure ahead of time.
  const audiences: AudienceNode[] = TREE.map((audience) => {
    const subs: CategoryNode[] = audience.children.map((sub) => {
      const fullHandle = `${audience.handle}-${sub.handle}`
      const bucket = buckets.get(fullHandle)!
      return {
        handle: fullHandle,
        sub_handle: sub.handle,
        name: sub.name,
        product_count: bucket.count,
        sample: bucket.sample,
      }
    })
    return {
      handle: audience.handle,
      name: audience.name,
      product_count: subs.reduce((sum, s) => sum + s.product_count, 0),
      subs,
    }
  })

  const totalCategories = audiences.reduce((sum, a) => sum + a.subs.length, 0)
  const emptyCategories = audiences.reduce(
    (sum, a) => sum + a.subs.filter((s) => s.product_count === 0).length,
    0
  )

  const response: HealthResponse = {
    audiences,
    summary: {
      total_published_products: publishedTotal,
      products_without_shop_category: productsWithoutShopCategory,
      orphan_sample: orphanSample,
      total_categories: totalCategories,
      populated_categories: totalCategories - emptyCategories,
      empty_categories: emptyCategories,
      capped: false,
      total_count_in_db: totalRow?.count != null ? Number(totalRow.count) : null,
    },
  }

  res.json(response)
}
