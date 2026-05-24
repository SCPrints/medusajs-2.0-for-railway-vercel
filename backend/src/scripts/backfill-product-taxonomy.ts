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
 * Flags:
 *   DRY_RUN=1       — log the diff without writing anything.
 *   REBUILD_TAGS=1  — REPLACE tag set on supplier-imported products with
 *                     classifier output. Removes stale/wrong tags.
 *                     Manual tags will be lost — opt in deliberately.
 *   REBUILD_TYPES=1 — REWRITE product_type on supplier-imported products
 *                     when the classifier produces a different value than
 *                     what's currently set. Use after an alias-map fix
 *                     (e.g. splitting a compound canonical type into two)
 *                     to migrate existing products to the new vocabulary.
 *                     Manual type overrides will be clobbered — opt in
 *                     deliberately.
 *   DUMP_UNTYPED=1  — write a diagnostic file at /tmp/backfill-untyped.log
 *                     listing every product whose title-fallback couldn't
 *                     infer a type, plus every tag value that didn't
 *                     normalize against TAG_ALIASES. Use to find alias-map
 *                     gaps — the report groups misses so patterns ("we
 *                     keep missing 'Coverall' in titles") jump out.
 *
 * Idempotent — re-run any time.
 *
 * Local:    cd backend && npx medusa exec src/scripts/backfill-product-taxonomy.ts
 * Fly.io:   fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && npx medusa exec src/scripts/backfill-product-taxonomy.js
 */

import fs from "node:fs"

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  applyTitleFallbacks,
  classifyAsColourProduct,
  classifyAussiePacificProduct,
  classifyFashionBizProduct,
  normalizeTags,
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
  // REBUILD_TAGS=1: for products with metadata.source (i.e. supplier-
  // imported), REPLACE the tag set with the classifier's canonical
  // output instead of unioning. Removes stale/wrong tags from previous
  // imports (e.g. "Short Sleeve" on a Long Sleeve product). Manual tags
  // added in admin will be removed too — that's the trade-off. Default
  // off (union mode) to preserve manual tags.
  const rebuildTags =
    process.env.REBUILD_TAGS === "1" || process.env.REBUILD_TAGS === "true"
  const rebuildTypes =
    process.env.REBUILD_TYPES === "1" || process.env.REBUILD_TYPES === "true"
  const dumpUntyped =
    process.env.DUMP_UNTYPED === "1" || process.env.DUMP_UNTYPED === "true"

  if (dryRun) logger.info("DRY_RUN=1 — no writes will be performed")
  if (rebuildTags) {
    logger.info(
      "REBUILD_TAGS=1 — supplier products will have tag set REPLACED with classifier output (removes stale tags)"
    )
  }
  if (rebuildTypes) {
    logger.info(
      "REBUILD_TYPES=1 — supplier products will have product_type REWRITTEN when classifier differs from current type (overrides manual edits)"
    )
  }
  if (dumpUntyped) {
    logger.info(
      "DUMP_UNTYPED=1 — full alias-miss log will be written to /tmp/backfill-untyped.log at the end of the run"
    )
  }

  // Pre-warm type + tag caches once so per-product upserts are cheap.
  const typeCache = await fetchAllProductTypes(productModule)
  const tagCache = await fetchAllProductTags(productModule)

  let offset = 0
  let totalScanned = 0
  let typeFilled = 0
  let tagsAdded = 0
  let tagsRemoved = 0
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

      // Type resolution:
      //  - Default: fill only when currently null (preserves manual edits).
      //    Classifier output preferred; title-fallback second.
      //  - REBUILD_TYPES=1 + supplier product + classifier produces something
      //    other than the current type → OVERWRITE. Needed after an
      //    alias-map change so existing products migrate to the new
      //    canonical vocabulary (e.g. "Singlets / Tanks" → "Singlets" |
      //    "Tanks" after the May 2026 split).
      const classifierType = supplierResult?.productType ?? null
      const fallbackType = fallback.productType ?? null
      let newType: string | null = null
      if (!currentType) {
        newType = classifierType ?? fallbackType
      } else if (
        rebuildTypes &&
        supplierResult &&
        classifierType &&
        classifierType !== currentType
      ) {
        newType = classifierType
      }
      const needsType = !!newType

      // Tags: behaviour depends on the mode:
      //  - REBUILD mode + supplier product → REPLACE with classifier output
      //    UNION any current tags that survive normalizeTags (i.e. ones
      //    that resolve to a canonical via TAG_ALIASES or fall through to a
      //    title-cased unknown). Noise tags in DROP_TAG_VALUES /
      //    GARBAGE_TAG_VALUES get filtered out by normalizeTags, so we don't
      //    accidentally clobber legitimate tags the classifier can't
      //    re-derive from stored metadata.fashionbiz (e.g. Biz Cool / Biz
      //    Eco — they're real fabric-tech labels that the FB API exposes
      //    inconsistently, but we want to keep them once they're on a
      //    product). Pass `undefined` as the log to avoid polluting
      //    unknownLog with re-scans of tags we're just trying to preserve.
      //  - Otherwise → UNION (additive only, preserves manual tags)
      const isSupplierProduct = !!supplierResult
      const cleanedCurrentTags =
        rebuildTags && isSupplierProduct
          ? normalizeTags(currentTags, undefined)
          : currentTags
      const finalTagSet =
        rebuildTags && isSupplierProduct
          ? Array.from(new Set([...fallback.tags, ...cleanedCurrentTags]))
          : Array.from(new Set([...currentTags, ...fallback.tags]))
      const tagsToAdd = finalTagSet.filter((t) => !currentTags.includes(t))
      const tagsToRemove = currentTags.filter((t) => !finalTagSet.includes(t))
      const needsTags = tagsToAdd.length > 0 || tagsToRemove.length > 0

      if (!needsType && !needsTags) continue

      if (sampleChanges.length < 15) {
        const changes: string[] = []
        if (needsType) {
          // Show "old → new" when this is an overwrite, plain "→ new" when filling.
          changes.push(
            currentType
              ? `type "${currentType}" → "${newType}"`
              : `type → "${newType}"`
          )
        }
        if (tagsToAdd.length) changes.push(`+[${tagsToAdd.join(", ")}]`)
        if (tagsToRemove.length) changes.push(`-[${tagsToRemove.join(", ")}]`)
        sampleChanges.push(`  ${product.title} (${product.handle}) — ${changes.join(", ")}`)
      }

      if (dryRun) {
        if (needsType) typeFilled++
        tagsAdded += tagsToAdd.length
        tagsRemoved += tagsToRemove.length
        continue
      }

      try {
        await applyTypeAndTagsToProduct({
          productModule,
          productId: product.id,
          productType: needsType ? newType : null,
          tags: needsTags ? finalTagSet : [],
          typeCache,
          tagCache,
        })
        if (needsType) typeFilled++
        tagsAdded += tagsToAdd.length
        tagsRemoved += tagsToRemove.length
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
  if (tagsRemoved > 0 || rebuildTags) {
    logger.info(`Tag(s) removed:     ${tagsRemoved}${dryRun ? " (dry-run)" : ""}`)
  }
  if (failures > 0) logger.info(`Failures:           ${failures}`)
  if (unknownLog.length > 0) {
    logger.info(`Title-inference fell through on ${unknownLog.length} title(s).`)
    // Don't dump every one — first 10 is enough to spot patterns.
    for (const line of unknownLog.slice(0, 10)) logger.info(`  ${line}`)
    if (unknownLog.length > 10) {
      logger.info(`  …and ${unknownLog.length - 10} more.`)
    }
  }

  // DUMP_UNTYPED=1: write the full unknownLog to /tmp so staff can grep it
  // for patterns. unknownLog mixes two distinct miss kinds — title-fallback
  // (product_type stayed null) and tag normalization (a tag value didn't
  // match TAG_ALIASES). Split + write a structured report so each pattern
  // can be inspected on its own.
  if (dumpUntyped && unknownLog.length > 0) {
    const titleMisses = unknownLog.filter((l) => l.startsWith("[title-fallback]"))
    const tagMisses = unknownLog.filter((l) => l.startsWith("[tag]"))
    const otherMisses = unknownLog.filter(
      (l) => !l.startsWith("[title-fallback]") && !l.startsWith("[tag]")
    )
    const dumpPath = "/tmp/backfill-untyped.log"
    const lines: string[] = [
      `Backfill diagnostic — ${new Date().toISOString()}`,
      `Total products scanned: ${totalScanned}`,
      `Total unknownLog entries: ${unknownLog.length}`,
      "",
      "=== TITLE MISSES ===",
      `(${titleMisses.length} products whose title-fallback couldn't infer a product_type.`,
      ` These products are invisible to the storefront mega-menu, the chatbot,`,
      ` and decoration pricing. Look for repeating words/phrases to extend`,
      ` PRODUCT_TYPE_ALIASES in backend/src/lib/product-taxonomy.ts.)`,
      "",
      ...titleMisses,
      "",
      "=== TAG NORMALIZATION MISSES ===",
      `(${tagMisses.length} tag values that didn't match TAG_ALIASES — fell`,
      ` back to title-case. Not necessarily broken, but each repeating one`,
      ` is a candidate for explicit aliasing.)`,
      "",
      ...tagMisses,
    ]
    if (otherMisses.length > 0) {
      lines.push(
        "",
        "=== OTHER ===",
        `(${otherMisses.length} entries not matching either prefix — shouldn't happen.)`,
        "",
        ...otherMisses
      )
    }
    try {
      fs.writeFileSync(dumpPath, lines.join("\n"))
      logger.info(
        `DUMP_UNTYPED=1 — wrote ${unknownLog.length} entries to ${dumpPath}`
      )
      logger.info(
        `  Read it with: cat ${dumpPath}  (or scp from the container)`
      )
    } catch (err: any) {
      logger.warn(`DUMP_UNTYPED=1 — failed to write ${dumpPath}: ${err?.message ?? err}`)
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
