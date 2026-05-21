import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { applyTitleFallbacks } from "../../../../lib/product-taxonomy"
import {
  applyTypeAndTagsToProduct,
  fetchAllProductTags,
  fetchAllProductTypes,
} from "../../../../lib/product-type-tag-sync"
import {
  assignCategoriesToProducts,
  ensureCategoryTree,
} from "../../../../lib/shop-categories"

/**
 * POST /admin/taxonomy-audit/backfill
 *
 * Runs the title-fallback inference pass over a specific set of newly-
 * created products (e.g. just after the spreadsheet-sync `product.batch`
 * succeeds). Same behaviour as the standalone `backfill-product-taxonomy`
 * script, but scoped to `product_ids` so we don't re-walk the whole
 * catalog every spreadsheet import.
 *
 * Body: `{ product_ids: string[] }` (required, max 500).
 *
 * Side effects:
 *  - Fills `product_type` where currently null (never overwrites)
 *  - Appends "Men" / "Women" / "Kids" tag from the title if not already set
 *  - Re-runs `assignCategoriesToProducts` so Shop-category handles
 *    follow the freshly-set type
 */

const MAX_PRODUCT_IDS = 500

type ProductRow = {
  id: string
  title: string | null
  status: string | null
  type: { value: string | null } | null
  tags: Array<{ value: string }> | null
}

const DEMOGRAPHIC_TAGS = new Set(["Men", "Women", "Kids"])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { product_ids?: unknown }
  const rawIds = body.product_ids
  if (!Array.isArray(rawIds)) {
    res.status(400).json({ error: "product_ids must be an array of strings" })
    return
  }
  const productIds = rawIds
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, MAX_PRODUCT_IDS)

  if (!productIds.length) {
    res.json({
      scanned: 0,
      type_filled: 0,
      tag_filled: 0,
      categories_updated: 0,
      failures: 0,
    })
    return
  }

  const container = req.scope
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "status", "type.value", "tags.value"],
    filters: { id: productIds },
  })
  const rows = (data ?? []) as ProductRow[]

  const typeCache = await fetchAllProductTypes(productModule)
  const tagCache = await fetchAllProductTags(productModule)
  const unknownLog: string[] = []

  let typeFilled = 0
  let tagFilled = 0
  let failures = 0

  for (const product of rows) {
    if ((product.status ?? "") !== "published") continue
    const currentType = product.type?.value ?? null
    const currentTags = (product.tags ?? []).map((t) => t.value)

    const fallback = applyTitleFallbacks(
      { productType: currentType, tags: currentTags },
      product.title ?? "",
      unknownLog
    )

    const needsType = !currentType && !!fallback.productType
    const newDemographicTags = fallback.tags.filter(
      (t) => !currentTags.includes(t) && DEMOGRAPHIC_TAGS.has(t)
    )
    const needsTag = newDemographicTags.length > 0
    if (!needsType && !needsTag) continue

    try {
      const fullTagSet = needsTag
        ? Array.from(new Set([...currentTags, ...newDemographicTags]))
        : currentTags
      await applyTypeAndTagsToProduct({
        productModule,
        productId: product.id,
        productType: needsType ? fallback.productType : null,
        tags: needsTag ? fullTagSet : [],
        typeCache,
        tagCache,
      })
      if (needsType) typeFilled++
      if (needsTag) tagFilled++
    } catch {
      failures++
    }
  }

  // Re-run shop-category assignment scoped to these IDs so any newly-set
  // type translates into `<audience>-<sub>` handle assignment.
  let categoriesUpdated = 0
  try {
    const byHandle = await ensureCategoryTree(container as any, {})
    const summary = await assignCategoriesToProducts(container as any, byHandle, {
      productIds,
    })
    categoriesUpdated = summary.updated
  } catch {
    // Category assignment failure shouldn't fail the whole request — the
    // type/tag work has already landed.
  }

  res.json({
    scanned: rows.length,
    type_filled: typeFilled,
    tag_filled: tagFilled,
    categories_updated: categoriesUpdated,
    failures,
    unknown_titles: unknownLog.slice(0, 20),
  })
}
