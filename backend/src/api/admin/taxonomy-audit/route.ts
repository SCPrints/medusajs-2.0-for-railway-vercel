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
 */

const DEMOGRAPHIC_TAGS = new Set(["Men", "Women", "Kids", "Unisex"])

// Shop-category handles follow the pattern `<audience>-<sub>` (e.g.
// `mens-t-shirts`). Build the set of audience prefixes once.
const SHOP_AUDIENCE_PREFIXES = TREE.map((t) => `${t.handle}-`)

type ProductRow = {
  id: string
  title: string | null
  handle: string | null
  status: string | null
  type: { value: string | null } | null
  tags: Array<{ value: string }> | null
  categories: Array<{ handle: string }> | null
}

type SampleEntry = {
  id: string
  title: string
  handle: string
}

const SAMPLE_LIMIT = 25
// Cap the walk at a sensible ceiling — same convention as other admin
// audit / report endpoints. With ~20 suppliers down the line this may
// need to grow, but anything > 10k should be paged client-side.
const MAX_PRODUCTS = 10000

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as any

  const { data, metadata } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "status",
      "type.value",
      "tags.value",
      "categories.handle",
    ],
    pagination: { take: MAX_PRODUCTS, skip: 0 },
  })

  const rows = (data ?? []) as ProductRow[]

  const missingType: SampleEntry[] = []
  const missingDemographic: SampleEntry[] = []
  const missingShopCategory: SampleEntry[] = []
  let missingTypeCount = 0
  let missingDemographicCount = 0
  let missingShopCategoryCount = 0
  let publishedCount = 0

  for (const product of rows) {
    if ((product.status ?? "") !== "published") continue
    publishedCount++

    const sample: SampleEntry = {
      id: product.id,
      title: product.title ?? "(no title)",
      handle: product.handle ?? "",
    }

    if (!product.type?.value) {
      missingTypeCount++
      if (missingType.length < SAMPLE_LIMIT) missingType.push(sample)
    }

    const tagValues = (product.tags ?? []).map((t) => t.value)
    const hasDemographicTag = tagValues.some((v) => DEMOGRAPHIC_TAGS.has(v))
    if (!hasDemographicTag) {
      missingDemographicCount++
      if (missingDemographic.length < SAMPLE_LIMIT) {
        missingDemographic.push(sample)
      }
    }

    const categoryHandles = (product.categories ?? []).map((c) => c.handle)
    const hasShopCategory = categoryHandles.some((h) =>
      SHOP_AUDIENCE_PREFIXES.some((prefix) => h.startsWith(prefix))
    )
    if (!hasShopCategory) {
      missingShopCategoryCount++
      if (missingShopCategory.length < SAMPLE_LIMIT) {
        missingShopCategory.push(sample)
      }
    }
  }

  res.json({
    total_products: publishedCount,
    capped: rows.length >= MAX_PRODUCTS,
    total_count_in_db: metadata?.count ?? null,
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
