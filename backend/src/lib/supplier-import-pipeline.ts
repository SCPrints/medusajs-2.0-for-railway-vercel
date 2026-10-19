/**
 * Post-create pipeline shared by every supplier importer (AS Colour,
 * FashionBiz, Aussie Pacific) across both the CLI scripts and the admin-UI
 * routes. The pipeline is split into 4 composable helpers rather than one
 * monolithic wrapper so each importer can interleave supplier-specific
 * side-effects (e.g. FashionBiz's garment_images patch) between phases:
 *
 *   1. linkProductsToBrand          — populate the Product↔Brand link table
 *   2. applyTaxonomyToProducts<T>   — classify + title-fallbacks + persist
 *                                     product_type + demographic tags
 *   3. applyShopCategoriesToProducts — assign audience × garment-type sub
 *                                      so the mega-menu drill-down finds it
 *   4. seedInventoryLevels          — upsert inventory_levels at one location
 *                                     from a SKU → qty plan
 *
 * CLAUDE.md "Types & tags convention" + "Required shop-categories step":
 * every importer MUST call applyTaxonomyToProducts and
 * applyShopCategoriesToProducts after products are created. Forgetting one
 * is the bug that landed the catalog without mega-menu coverage on May 23.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BRAND_MODULE } from "../modules/brand"
import { writeInventoryLevels, type InventoryWriteResult } from "./inventory-level-writes"
import { applyTitleFallbacks } from "./product-taxonomy"
import {
  applyTypeAndTagsToProduct,
  fetchAllProductTags,
  fetchAllProductTypes,
} from "./product-type-tag-sync"
import {
  assignCategoriesToProducts,
  ensureCategoryTree,
} from "./shop-categories"

/** Minimal logger shape — accepts the framework logger or a console shim. */
export type SupplierImportLogger = {
  info: (msg: string) => void
  warn: (msg: string) => void
}

/** Minimal shape of a product row returned by `createProductsWorkflow`. */
export type CreatedSupplierProduct = {
  id: string
  handle: string
  title?: string | null
}

/**
 * Link every product to a Brand entity via the product↔brand Module Link.
 * Idempotent — "already linked" errors are silently absorbed so re-runs of
 * the importer don't fail. Other link errors are swallowed too (matches
 * existing per-importer behaviour) so a single bad row doesn't take down
 * the whole batch; verify-brand-links catches genuine drift later.
 */
export async function linkProductsToBrand(
  container: MedusaContainer,
  products: ReadonlyArray<CreatedSupplierProduct>,
  brandId: string
): Promise<void> {
  if (!products.length) return
  const link = container.resolve(ContainerRegistrationKeys.LINK) as any
  for (const p of products) {
    if (!p?.id) continue
    try {
      await link.create({
        [Modules.PRODUCT]: { product_id: p.id },
        [BRAND_MODULE]: { brand_id: brandId },
      })
    } catch (err: any) {
      if (
        !/already|multiple links|duplicate/i.test(String(err?.message ?? ""))
      ) {
        // non-fatal: existing importer behaviour silently absorbs link
        // failures; verify-brand-links is the source of truth for drift.
      }
    }
  }
}

export type SupplierTaxonomyClassifier<TSourceProduct> = (
  source: TSourceProduct,
  unknownLog: string[]
) => { productType: string | null; tags: string[] }

export type SupplierTaxonomyResult = {
  ok: number
  failed: number
  unknown: ReadonlyArray<string>
}

/**
 * Apply product_type + demographic tags to every created product.
 *   1. Run the supplier-specific classifier against the source API record
 *   2. Augment with title-based fallbacks (covers APIs that return null/
 *      empty taxonomy fields — frequent on AS Colour accessories and large
 *      stretches of FashionBiz's catalog)
 *   3. Persist via applyTypeAndTagsToProduct (resolves IDs via cache,
 *      creates type/tag rows on demand)
 *
 * Returns counts + unknown-taxonomy log so callers can show feedback in
 * admin or surface anomalies in CLI logs.
 */
export async function applyTaxonomyToProducts<TSourceProduct>(
  container: MedusaContainer,
  opts: {
    products: ReadonlyArray<CreatedSupplierProduct>
    sourceByHandle: ReadonlyMap<string, TSourceProduct>
    classify: SupplierTaxonomyClassifier<TSourceProduct>
    logger: SupplierImportLogger
    /**
     * Brand handle for the supplier (e.g. `"as-colour"`). Passed through
     * to `applyTitleFallbacks` so brand-conventions like AS Colour's
     * unisex-by-default catalog can fire after all other inference.
     * Optional — omit for suppliers whose products are always explicitly
     * gendered (FashionBiz family, Aussie Pacific).
     */
    brandHandle?: string | null
  }
): Promise<SupplierTaxonomyResult> {
  const { products, sourceByHandle, classify, logger, brandHandle } = opts
  if (!products.length) return { ok: 0, failed: 0, unknown: [] }

  const productModule = container.resolve(Modules.PRODUCT) as any
  const typeCache = await fetchAllProductTypes(productModule)
  const tagCache = await fetchAllProductTags(productModule)
  const unknownTaxonomy: string[] = []
  let ok = 0
  let failed = 0

  for (const p of products) {
    const source = sourceByHandle.get(p.handle)
    if (!source) continue
    const classified = classify(source, unknownTaxonomy)
    const { productType, tags } = applyTitleFallbacks(
      classified,
      p.title ?? "",
      unknownTaxonomy,
      brandHandle
    )
    if (!productType && !tags.length) continue
    try {
      await applyTypeAndTagsToProduct({
        productModule,
        productId: p.id,
        productType,
        tags,
        typeCache,
        tagCache,
      })
      ok++
    } catch (err: any) {
      failed++
      logger.warn(
        `Failed to set type/tags for ${p.handle}: ${err?.message ?? err}`
      )
    }
  }
  for (const msg of unknownTaxonomy) logger.warn(`[taxonomy] ${msg}`)
  logger.info(`Type/tag sync: ${ok} ok, ${failed} failed.`)
  return { ok, failed, unknown: unknownTaxonomy }
}

/**
 * Ensure the shop-category tree exists (creates missing audiences + subs),
 * then assign every created product to the right audience × garment-type
 * sub. Idempotent and safe to call on re-runs. Failures are caught and
 * logged so a category-assignment problem doesn't fail the whole import.
 */
export async function applyShopCategoriesToProducts(
  container: MedusaContainer,
  products: ReadonlyArray<CreatedSupplierProduct>,
  logger: SupplierImportLogger
): Promise<{ updated: number; untyped: number; failures: number } | null> {
  if (!products.length) return null
  try {
    const byHandle = await ensureCategoryTree(container, { logger })
    const productIds = products
      .map((p) => p.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
    const summary = await assignCategoriesToProducts(container, byHandle, {
      productIds,
      logger,
    })
    logger.info(
      `Shop categories: ${summary.updated} categorized, ${summary.untyped} untyped, ${summary.failures} failed.`
    )
    return summary
  } catch (err: any) {
    logger.warn(`Shop category assignment failed: ${err?.message ?? err}`)
    return null
  }
}

/**
 * Upsert inventory_levels at `locationId` from a SKU → qty plan. SKUs that
 * don't resolve to an inventory_item are skipped silently — the variant was
 * either not created or doesn't exist on this location. The createProducts
 * workflow is responsible for creating the inventory_items themselves; this
 * helper only attaches stock levels to them.
 */
export async function seedInventoryLevels(
  container: MedusaContainer,
  opts: {
    stockBySku: ReadonlyMap<string, number>
    locationId: string
    logger?: SupplierImportLogger
  }
): Promise<InventoryWriteResult> {
  // Same change-only / chunked / guarded path as the daily syncs
  // (lib/inventory-level-writes). A fresh import is almost all creates, so
  // the drift guard has nothing to judge and never fires here.
  return writeInventoryLevels(container, opts)
}
