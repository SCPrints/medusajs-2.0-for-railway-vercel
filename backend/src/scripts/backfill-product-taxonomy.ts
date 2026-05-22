/**
 * Backfill `product_type` and tags on existing products.
 *
 * Three passes per product:
 *   1. Title-fallback inference — fills missing type and appends a
 *      demographic tag (Men/Women/Kids) from the title when API/CSV
 *      cells were blank.
 *   2. Supplier classifier re-run — when `metadata.source` is one of
 *      "fashionbiz" / "ascolour" / "aussiepacific", reconstruct the
 *      supplier product shape from stored metadata and re-run the
 *      classifier so the full canonical tag set (Hi-Vis / Modern Fit /
 *      Industrial / Long Sleeve / etc.) is written. This rebuilds tags
 *      on products imported before the classifier was complete OR
 *      where the original import didn't write them for any reason.
 *   3. Shop category re-assignment — uses the latest TREE + inference
 *      rules, picks up new categories created in this run.
 *
 * Tags are UNIONED with existing tags (never replaced), so any manual
 * tags a staff member added in admin are preserved. Type is only filled
 * when currently null (existing types are never overwritten).
 *
 * Idempotent — re-run any time. Set `DRY_RUN=1` to log without writes.
 *
 * Local:    cd backend && npx medusa exec src/scripts/backfill-product-taxonomy.ts
 * Fly.io:   fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && npx medusa exec src/scripts/backfill-product-taxonomy.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  applyTitleFallbacks,
  classifyAsColourProduct,
  classifyAussiePacificProduct,
  classifyFashionBizProduct,
} from "../lib/product-taxonomy"
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
  metadata: Record<string, any> | null
}

/**
 * Reconstruct the supplier-specific classifier output from product
 * metadata. Returns null when the metadata isn't from a known supplier
 * (e.g. spreadsheet-sync products, manually created, DTF service).
 */
function classifyFromMetadata(
  metadata: Record<string, any> | null,
  unknownLog: string[]
): { productType: string | null; tags: string[] } | null {
  if (!metadata || !metadata.source) return null

  switch (metadata.source) {
    case "fashionbiz": {
      const fb = metadata.fashionbiz ?? {}
      return classifyFashionBizProduct(
        {
          slug: fb.slug ?? null,
          tags: Array.isArray(fb.tags) ? fb.tags : [],
          gender: fb.gender ?? undefined,
          fit: fb.fit ?? undefined,
          sleeve: fb.sleeve ?? undefined,
          industry: fb.industry ?? undefined,
          tech: fb.tech ?? undefined,
        } as any,
        unknownLog
      )
    }
    case "ascolour": {
      const asc = metadata.ascolour ?? {}
      return classifyAsColourProduct(
        {
          styleCode: asc.styleCode ?? "",
          productType: asc.productType ?? undefined,
          category: asc.category ?? undefined,
          gender: asc.gender ?? undefined,
          fit: asc.fit ?? undefined,
        } as any,
        unknownLog
      )
    }
    case "aussiepacific": {
      const ap = metadata.aussiepacific ?? {}
      return classifyAussiePacificProduct(
        {
          main_category: ap.main_category ?? undefined,
          sub_category: ap.sub_category ?? undefined,
          style: ap.style ?? undefined,
          style_code: ap.style_code ?? "",
        } as any,
        unknownLog
      )
    }
    default:
      return null
  }
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
  let tagsAdded = 0
  let failures = 0
  const unknownLog: string[] = []
  const sampleChanges: string[] = []

  // 1. Page through every product, re-run classifier + title fallback,
  //    union the resulting tag set with current tags. Patch when changes.
  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "type.value",
        "tags.value",
        "metadata",
      ],
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

      // Pass 1: Supplier classifier from stored metadata (rebuilds the
      // canonical tag set even if the original import didn't write them).
      const supplierResult = classifyFromMetadata(
        product.metadata ?? null,
        unknownLog
      )

      // Pass 2: Title-fallback on top of whatever the supplier classifier
      // produced (or empty if no supplier metadata).
      const baseline = supplierResult ?? {
        productType: currentType,
        tags: [],
      }
      const fallback = applyTitleFallbacks(baseline, title, unknownLog)

      // Type: fill only when currently null. Never overwrite.
      const newType = !currentType && fallback.productType ? fallback.productType : null
      const needsType = !!newType

      // Tags: UNION classifier output with current tags so manual tags are
      // preserved. Only count as "new" what wasn't already present.
      const tagsToAdd = fallback.tags.filter((t) => !currentTags.includes(t))
      const needsTags = tagsToAdd.length > 0

      if (!needsType && !needsTags) continue

      if (sampleChanges.length < 15) {
        const changes: string[] = []
        if (needsType) changes.push(`type → ${newType}`)
        if (needsTags) changes.push(`tag(s) +[${tagsToAdd.join(", ")}]`)
        sampleChanges.push(`  ${product.title} (${product.handle}) — ${changes.join(", ")}`)
      }

      if (dryRun) {
        if (needsType) typeFilled++
        if (needsTags) tagsAdded += tagsToAdd.length
        continue
      }

      try {
        // applyTypeAndTagsToProduct REPLACES the full tag set — pass the
        // union of current + new so nothing's lost.
        const fullTagSet = Array.from(
          new Set([...currentTags, ...tagsToAdd])
        )
        await applyTypeAndTagsToProduct({
          productModule,
          productId: product.id,
          productType: needsType ? newType : null,
          tags: needsTags ? fullTagSet : [],
          typeCache,
          tagCache,
        })
        if (needsType) typeFilled++
        if (needsTags) tagsAdded += tagsToAdd.length
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
  logger.info(`Tag(s) added:       ${tagsAdded}${dryRun ? " (dry-run)" : ""}`)
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
