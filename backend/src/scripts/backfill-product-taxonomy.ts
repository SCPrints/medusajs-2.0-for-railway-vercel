/**
 * Backfill `product_type` and demographic tags ("Men" / "Women" / "Kids")
 * on existing products by re-running the title-fallback inference that
 * the importers now apply on create.
 *
 * Use case: products already in the catalog before
 * `applyTitleFallbacks` was wired into the importers (or imported via
 * spreadsheet sync where no fallback runs) are missing the type and
 * demographic tag the storefront filters / mega-menu need. This script
 * walks every product, computes what `applyTitleFallbacks` would
 * produce given the existing fields + title, and patches the gaps.
 *
 * Behaviour:
 *   - Type is ONLY filled when currently null/empty. Existing types
 *     are NEVER overwritten.
 *   - Demographic tag is appended only when not already present. Other
 *     existing tags are preserved.
 *   - Re-runs `assignCategoriesToProducts` at the end so the menu
 *     drill-down catches up.
 *
 * Idempotent — re-run any time. Set `DRY_RUN=1` to log without writes.
 *
 * Local:    cd backend && npx medusa exec src/scripts/backfill-product-taxonomy.ts
 * Fly.io:   fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && npx medusa exec src/scripts/backfill-product-taxonomy.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { applyTitleFallbacks } from "../lib/product-taxonomy"
import {
  applyTypeAndTagsToProduct,
  fetchAllProductTags,
  fetchAllProductTypes,
} from "../lib/product-type-tag-sync"
import {
  assignCategoriesToProducts,
  ensureCategoryTree,
} from "../lib/shop-categories"

type ProductRow = {
  id: string
  title: string | null
  handle: string | null
  status: string | null
  type: { value: string | null } | null
  tags: Array<{ value: string }> | null
}

// Page through products one chunk at a time so we don't blow heap on
// large catalogs. Tune up if needed.
const PAGE_SIZE = 200

export default async function backfillProductTaxonomy({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  if (dryRun) logger.info("DRY_RUN=1 — no writes will be performed")

  // Pre-warm type + tag caches once so per-product upserts are cheap.
  const typeCache = await fetchAllProductTypes(productModule)
  const tagCache = await fetchAllProductTags(productModule)

  let offset = 0
  let totalScanned = 0
  let typeFilled = 0
  let tagFilled = 0
  let failures = 0
  const unknownLog: string[] = []
  const sampleChanges: string[] = []

  // 1. Page through every product, compute what fallback would yield,
  //    patch only the gaps. Existing values are never overwritten.
  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "status", "type.value", "tags.value"],
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    const rows = (data ?? []) as ProductRow[]
    if (!rows.length) break

    for (const product of rows) {
      totalScanned++

      // Skip drafts / archived — only operate on published catalog. Saves
      // noise on old test products we'd never sell anyway.
      if ((product.status ?? "") !== "published") continue

      const currentType = product.type?.value ?? null
      const currentTags = (product.tags ?? []).map((t) => t.value)
      const title = product.title ?? ""

      // Re-run the same fallback pipeline the importers use, against
      // the EXISTING fields. If currentType is set, applyTitleFallbacks
      // is a no-op for type (correct — never overwrite a real value).
      const fallback = applyTitleFallbacks(
        { productType: currentType, tags: currentTags },
        title,
        unknownLog
      )

      const needsType = !currentType && !!fallback.productType
      const newDemographicTags = fallback.tags.filter(
        (t) => !currentTags.includes(t) && ["Men", "Women", "Kids"].includes(t)
      )
      const needsTag = newDemographicTags.length > 0
      if (!needsType && !needsTag) continue

      if (sampleChanges.length < 10) {
        const changes: string[] = []
        if (needsType) changes.push(`type → ${fallback.productType}`)
        if (needsTag) changes.push(`tag(s) +[${newDemographicTags.join(", ")}]`)
        sampleChanges.push(`  ${product.title} (${product.handle}) — ${changes.join(", ")}`)
      }

      if (dryRun) {
        if (needsType) typeFilled++
        if (needsTag) tagFilled++
        continue
      }

      try {
        // applyTypeAndTagsToProduct REPLACES the tag set — we need to
        // pass the FULL tag list (existing + new) so we don't lose
        // tags like "Cotton" or "Stretch" that other classifiers wrote.
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
      } catch (err: any) {
        failures++
        logger.warn(
          `Failed to backfill ${product.handle} (${product.id}): ${err?.message ?? err}`
        )
      }
    }

    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  logger.info("---")
  logger.info("Sample backfill changes:")
  for (const line of sampleChanges) logger.info(line)
  logger.info("---")
  logger.info(`Scanned ${totalScanned} product(s).`)
  logger.info(`Type filled:        ${typeFilled}${dryRun ? " (dry-run)" : ""}`)
  logger.info(`Demographic tag(s): ${tagFilled}${dryRun ? " (dry-run)" : ""}`)
  if (failures > 0) logger.info(`Failures:           ${failures}`)
  if (unknownLog.length > 0) {
    logger.info(`Title-inference fell through on ${unknownLog.length} title(s).`)
    // Don't dump every one — first 10 is enough to spot patterns.
    for (const line of unknownLog.slice(0, 10)) logger.info(`  ${line}`)
    if (unknownLog.length > 10) {
      logger.info(`  …and ${unknownLog.length - 10} more.`)
    }
  }

  // 2. Re-run Shop category assignment. The category assignment reads
  //    the LIVE product.type — so any product that just got its type
  //    filled will now resolve to a `<audience>-<sub>` handle.
  logger.info("---")
  logger.info("Re-assigning Shop categories on the full catalog…")
  const byHandle = await ensureCategoryTree(container, { dryRun, logger })
  const summary = await assignCategoriesToProducts(container, byHandle, {
    dryRun,
    logger,
  })
  logger.info(`Shop categories — updated: ${summary.updated}, skipped: ${summary.skipped}, untyped: ${summary.untyped}, failed: ${summary.failures}`)

  logger.info("Done.")
}
