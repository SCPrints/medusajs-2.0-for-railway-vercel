import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { TREE } from "../../../lib/shop-categories"

/**
 * GET /admin/taxonomy-audit
 *
 * Walks the product catalog and reports how many products are missing
 * the three taxonomy signals that the storefront relies on:
 *   1. `product_type` (used by filters, the chatbot, decoration pricing)
 *   2. A demographic tag — "Men" / "Women" / "Kids" / "Unisex"
 *      (used by audience-aware browse, the mega-menu, and reports)
 *   3. A Shop category that belongs to the audience × garment-type
 *      TREE in shop-categories.ts (used by the mega-menu drill-down)
 *
 * For each dimension we return the count + a small sample so staff can
 * click through to the product detail page and fix it manually.
 *
 * One SQL read: Postgres works out the three signals per published product.
 * It used to sweep every product through query.graph with its type, tags and
 * categories, which blocks the event loop for about a minute on the live
 * catalogue (27 Nov 2026, the same cause as the Shop categories health freeze).
 */

const DEMOGRAPHIC_TAGS = ["Men", "Women", "Kids", "Unisex"]

// Shop-category handles follow the pattern `<audience>-<sub>` (e.g.
// `mens-t-shirts`). Audience handles are plain words, so `mens-%` is a safe
// LIKE prefix.
const SHOP_AUDIENCE_PATTERNS = TREE.map((t) => `${t.handle}-%`)

type Row = {
  id: string
  title: string | null
  handle: string | null
  has_type: boolean
  has_demographic: boolean
  has_shop_category: boolean
}

type SampleEntry = {
  id: string
  title: string
  handle: string
}

const SAMPLE_LIMIT = 25

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const pg = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  // Soft-deleted types, tags and categories don't count, as with query.graph.
  const { rows } = (await pg.raw(
    `select p.id, p.title, p.handle,
            coalesce(pt.value, '') <> '' as has_type,
            exists (select 1 from product_tags x
                      join product_tag t on t.id = x.product_tag_id and t.deleted_at is null
                     where x.product_id = p.id and t.value = any(?::text[])) as has_demographic,
            exists (select 1 from product_category_product x
                      join product_category c on c.id = x.product_category_id and c.deleted_at is null
                     where x.product_id = p.id and c.handle like any(?::text[])) as has_shop_category
       from product p
       left join product_type pt on pt.id = p.type_id and pt.deleted_at is null
      where p.status = 'published' and p.deleted_at is null
      order by p.id`,
    [DEMOGRAPHIC_TAGS, SHOP_AUDIENCE_PATTERNS]
  )) as { rows: Row[] }
  const totalRow = (await pg("product").whereNull("deleted_at").count("id as count").first()) as
    | { count?: string | number }
    | undefined

  const missingType: SampleEntry[] = []
  const missingDemographic: SampleEntry[] = []
  const missingShopCategory: SampleEntry[] = []
  let missingTypeCount = 0
  let missingDemographicCount = 0
  let missingShopCategoryCount = 0

  for (const product of rows) {
    const sample: SampleEntry = {
      id: product.id,
      title: product.title ?? "(no title)",
      handle: product.handle ?? "",
    }

    if (!product.has_type) {
      missingTypeCount++
      if (missingType.length < SAMPLE_LIMIT) missingType.push(sample)
    }
    if (!product.has_demographic) {
      missingDemographicCount++
      if (missingDemographic.length < SAMPLE_LIMIT) missingDemographic.push(sample)
    }
    if (!product.has_shop_category) {
      missingShopCategoryCount++
      if (missingShopCategory.length < SAMPLE_LIMIT) missingShopCategory.push(sample)
    }
  }

  res.json({
    total_products: rows.length,
    capped: false,
    total_count_in_db: totalRow?.count != null ? Number(totalRow.count) : null,
    missing_type: {
      count: missingTypeCount,
      sample: missingType,
    },
    missing_demographic_tag: {
      count: missingDemographicCount,
      sample: missingDemographic,
    },
    missing_shop_category: {
      count: missingShopCategoryCount,
      sample: missingShopCategory,
    },
  })
}
