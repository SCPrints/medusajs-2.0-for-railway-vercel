/**
 * Diff + apply path for supplier importers — the UPDATE companion to
 * supplier-import-pipeline.ts (which owns the CREATE side).
 *
 * Lets a re-run of import-fashionbiz-from-api / import-gildan-from-xlsx
 * pick up:
 *   - corrected titles / descriptions / images
 *   - newly-added colour variants Gildan/FashionBiz/AP shipped since
 *     the last import
 *   - price changes (rare but real — supplier raises cost mid-season)
 *   - per-variant metadata fixes (garment_images, hex_value, etc.)
 *
 * Without this, every importer's "already exists → skip" branch silently
 * leaves stale data in production until staff hand-edits it. The
 * fashionbiz importer worked around it specifically for garment_images
 * (see the "restored variant" patch at the bottom of the script); the
 * generic flow replaces that one-off.
 *
 * NOT diffed here (handled by sibling helpers, also re-runnable):
 *   - product_type + tags        → applyTaxonomyToProducts
 *   - shop-category assignments  → applyShopCategoriesToProducts
 *   - brand link                 → linkProductsToBrand
 *   - inventory levels           → seedInventoryLevels
 *
 * The "desired" payload shape mirrors what createProductsWorkflow accepts
 * (so importers re-use the exact same payload they'd push on a first
 * run) plus a `handle` field used as the join key against existing rows.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  batchProductVariantsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

import { writeProductImages } from "./safe-product-images"

export type SupplierSyncLogger = {
  info: (msg: string) => void
  warn: (msg: string) => void
}

/** One variant inside a desired payload. Same shape importers pass to createProductsWorkflow. */
export type DesiredVariant = {
  sku: string
  title?: string | null
  options?: Record<string, string>
  manage_inventory?: boolean
  allow_backorder?: boolean
  metadata?: Record<string, unknown>
  prices?: Array<{
    amount: number
    currency_code: string
    min_quantity?: number
    max_quantity?: number
  }>
}

/** A single product the importer wants in the database after sync completes. */
export type DesiredProduct = {
  handle: string
  title?: string
  description?: string | null
  thumbnail?: string | null
  material?: string | null
  status?: string
  images?: Array<{ url: string }>
  variants?: DesiredVariant[]
  metadata?: Record<string, unknown>
}

/** Shape of the existing row pulled from the product graph. */
export type ExistingProductRow = {
  id: string
  handle: string
  title?: string | null
  description?: string | null
  thumbnail?: string | null
  material?: string | null
  status?: string | null
  images?: Array<{ id?: string; url: string }> | null
  variants?: Array<{
    id: string
    sku?: string | null
    title?: string | null
    metadata?: Record<string, unknown> | null
    prices?: Array<{
      id?: string
      amount: number | string
      currency_code: string
      min_quantity?: number | null
      max_quantity?: number | null
    }> | null
  }> | null
  metadata?: Record<string, unknown> | null
}

export type VariantPatch = {
  id: string
  title?: string
  metadata?: Record<string, unknown>
  prices?: Array<{
    amount: number
    currency_code: string
    min_quantity?: number
    max_quantity?: number
  }>
}

export type NewVariantPayload = {
  product_id: string
  sku: string
  title: string
  options: Record<string, string>
  manage_inventory: boolean
  allow_backorder: boolean
  metadata?: Record<string, unknown>
  prices?: Array<{
    amount: number
    currency_code: string
    min_quantity?: number
    max_quantity?: number
  }>
}

export type ProductDiff = {
  productId: string
  handle: string
  /** Patch object passed straight into updateProductsWorkflow's `products[]`. Empty = no top-level change. */
  topLevelPatch: Record<string, unknown>
  /** Variant rows to UPDATE (matched by SKU). */
  variantUpdates: VariantPatch[]
  /** Variant rows to CREATE (SKUs the existing product doesn't have). */
  variantsToAdd: NewVariantPayload[]
  /** Image URLs to append (existing URLs preserved; missing ones NOT removed). */
  imageUrlsToAdd: string[]
  /**
   * Image/thumbnail change to apply via the safe `writeProductimages()`
   * chokepoint (HARD RULES) — NOT through updateProductsWorkflow, so every URL
   * is HEAD-validated and the gallery can never be wiped. Null when neither
   * images nor thumbnail changed. `desiredUrls` is the FULL intended final list
   * (existing + new); `currentUrls` lets the writer skip a redundant DB read.
   */
  imageWrite:
    | { desiredUrls: string[]; currentUrls: string[]; thumbnail: string | null }
    | null
  /** Free-text reasons the diff fired; useful for logging. */
  reasons: string[]
}

/** Tolerance for price comparison in major units (1 cent). */
const PRICE_EPSILON_MAJOR = 0.005

const eqString = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? "") === (b ?? "")

const numericAmount = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return NaN
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Key for a single price tier — currency + qty band. Tiers with the same
 * key in two lists are the same row and only their amount can differ.
 */
const priceTierKey = (p: {
  currency_code: string
  min_quantity?: number | null
  max_quantity?: number | null
}): string => {
  const min = p.min_quantity ?? 1
  const max = p.max_quantity ?? "inf"
  return `${p.currency_code.toLowerCase()}-${min}-${max}`
}

/**
 * Two price tier sets differ if any band is missing on one side OR the
 * amount differs by more than PRICE_EPSILON_MAJOR cents.
 */
export function pricesDiffer(
  existing: ExistingProductRow["variants"] extends infer V
    ? V extends Array<{ prices?: infer P }>
      ? P
      : never
    : never,
  desired: DesiredVariant["prices"]
): boolean {
  const a = (existing ?? []) as NonNullable<typeof existing>
  const b = desired ?? []
  if (a.length !== b.length) return true
  const aMap = new Map<string, number>()
  const bMap = new Map<string, number>()
  for (const row of a) {
    aMap.set(priceTierKey(row), numericAmount(row.amount))
  }
  for (const row of b) {
    bMap.set(priceTierKey(row), numericAmount(row.amount))
  }
  if (aMap.size !== bMap.size) return true
  for (const [k, av] of aMap) {
    const bv = bMap.get(k)
    if (bv === undefined) return true
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return true
    if (Math.abs(av - bv) > PRICE_EPSILON_MAJOR) return true
  }
  return false
}

/**
 * Merge metadata while replacing the per-supplier key wholesale.
 *
 *   existing: { gildan: { last_sync: "old" }, customizer: { ... }, foo: "bar" }
 *   desired:  { gildan: { last_sync: "new", code: "G500" } }
 *   key:      "gildan"
 *   result:   { gildan: { last_sync: "new", code: "G500" }, customizer: { ... }, foo: "bar" }
 *
 * The customizer / foo keys are preserved (staff annotations stay). The
 * gildan key is replaced (a fresh snapshot of the source row).
 */
export function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  desired: Record<string, unknown> | null | undefined,
  supplierMetaKey: string
): { merged: Record<string, unknown>; changed: boolean } {
  const ex = existing ?? {}
  const de = desired ?? {}
  const merged: Record<string, unknown> = { ...ex }
  let changed = false
  for (const [k, v] of Object.entries(de)) {
    if (k === supplierMetaKey || k === "source" || k === "last_sync") {
      // Always overwrite for these keys.
      if (JSON.stringify(ex[k]) !== JSON.stringify(v)) {
        merged[k] = v
        changed = true
      }
    } else if (!(k in ex)) {
      // New keys land; existing keys outside the supplier block are
      // preserved (don't overwrite staff annotations).
      merged[k] = v
      changed = true
    }
  }
  return { merged, changed }
}

/**
 * Diff a desired payload against the existing product row. Pure — no DB,
 * no side effects. Returns a diff that can be inspected, logged, or
 * dry-run-previewed before applying.
 */
export function diffProduct(opts: {
  desired: DesiredProduct
  existing: ExistingProductRow
  supplierMetaKey: string
}): ProductDiff {
  const { desired, existing, supplierMetaKey } = opts
  const reasons: string[] = []
  const topLevelPatch: Record<string, unknown> = {}

  if (desired.title !== undefined && !eqString(desired.title, existing.title ?? "")) {
    topLevelPatch.title = desired.title
    reasons.push(`title: "${existing.title ?? ""}" → "${desired.title}"`)
  }
  if (
    desired.description !== undefined &&
    !eqString(desired.description ?? "", existing.description ?? "")
  ) {
    topLevelPatch.description = desired.description
    reasons.push("description changed")
  }
  const thumbnailChanged =
    desired.thumbnail !== undefined &&
    !eqString(desired.thumbnail ?? "", existing.thumbnail ?? "")

  if (
    desired.material !== undefined &&
    !eqString(desired.material ?? "", existing.material ?? "")
  ) {
    topLevelPatch.material = desired.material
    reasons.push("material changed")
  }

  // Images: append new URLs, never remove. Preserves images staff may
  // have uploaded manually. The actual write goes through `writeProductImages`
  // (HARD RULES) — not updateProductsWorkflow — so URLs are HEAD-validated and
  // the gallery can't be wiped; here we only compute the intended final set.
  const existingUrlList = (existing.images ?? [])
    .map((i) => i.url)
    .filter(Boolean) as string[]
  const existingUrls = new Set(existingUrlList)
  const imageUrlsToAdd: string[] = []
  for (const img of desired.images ?? []) {
    if (img?.url && !existingUrls.has(img.url)) {
      imageUrlsToAdd.push(img.url)
    }
  }
  if (imageUrlsToAdd.length) {
    reasons.push(`+${imageUrlsToAdd.length} image(s)`)
  }
  if (thumbnailChanged) {
    reasons.push("thumbnail changed")
  }
  const imageWrite =
    imageUrlsToAdd.length || thumbnailChanged
      ? {
          desiredUrls: [...existingUrlList, ...imageUrlsToAdd],
          currentUrls: existingUrlList,
          thumbnail: thumbnailChanged ? (desired.thumbnail ?? null) : null,
        }
      : null

  // Metadata: replace supplier key, preserve everything else.
  const metaResult = mergeMetadata(
    existing.metadata,
    desired.metadata,
    supplierMetaKey
  )
  if (metaResult.changed) {
    topLevelPatch.metadata = metaResult.merged
    reasons.push("metadata changed")
  }

  // Variants — match by SKU.
  const existingVariantBySku = new Map<
    string,
    NonNullable<ExistingProductRow["variants"]>[number]
  >()
  for (const v of existing.variants ?? []) {
    if (v.sku) existingVariantBySku.set(v.sku, v)
  }

  const variantUpdates: VariantPatch[] = []
  const variantsToAdd: NewVariantPayload[] = []
  const desiredSkus = new Set<string>()

  for (const dv of desired.variants ?? []) {
    if (!dv.sku) continue
    desiredSkus.add(dv.sku)
    const ev = existingVariantBySku.get(dv.sku)
    if (!ev) {
      // New variant — queue for create.
      variantsToAdd.push({
        product_id: existing.id,
        sku: dv.sku,
        title: dv.title || dv.sku,
        options: dv.options ?? {},
        manage_inventory: dv.manage_inventory ?? true,
        allow_backorder: dv.allow_backorder ?? false,
        metadata: dv.metadata,
        prices: dv.prices,
      })
      reasons.push(`+variant ${dv.sku}`)
      continue
    }
    // Existing variant — diff title, metadata, prices.
    const patch: VariantPatch = { id: ev.id }
    let patchHasContent = false

    if (dv.title && !eqString(dv.title, ev.title ?? "")) {
      patch.title = dv.title
      patchHasContent = true
    }
    if (dv.metadata) {
      const m = mergeMetadata(ev.metadata, dv.metadata, supplierMetaKey)
      if (m.changed) {
        patch.metadata = m.merged
        patchHasContent = true
      }
    }
    if (dv.prices && pricesDiffer(ev.prices ?? [], dv.prices)) {
      patch.prices = dv.prices
      patchHasContent = true
      reasons.push(`variant ${dv.sku} prices changed`)
    }
    if (patchHasContent) {
      variantUpdates.push(patch)
    }
  }

  // Variants in `existing` but not in `desired` are intentionally NOT
  // touched. A customer may have ordered a variant Gildan has since
  // discontinued; deactivating it would block re-orders. Staff hide
  // discontinued variants manually in admin if needed.

  return {
    productId: existing.id,
    handle: existing.handle,
    topLevelPatch,
    variantUpdates,
    variantsToAdd,
    imageUrlsToAdd,
    imageWrite,
    reasons,
  }
}

/**
 * True if the diff has anything to apply. Useful so callers can skip
 * no-op DB round-trips entirely.
 */
export function diffHasChanges(d: ProductDiff): boolean {
  return (
    Object.keys(d.topLevelPatch).length > 0 ||
    d.variantUpdates.length > 0 ||
    d.variantsToAdd.length > 0 ||
    d.imageWrite != null
  )
}

export type ApplySummary = {
  productsUpdated: number
  productsUnchanged: number
  variantsUpdated: number
  variantsAdded: number
  errors: number
}

/**
 * Apply a batch of diffs. Re-uses Medusa's updateProductsWorkflow (which
 * fans out to upsertVariantPricesWorkflow internally) for top-level +
 * existing-variant edits, and batchProductVariantsWorkflow for new
 * variant creates. Both are core workflows so they trigger the normal
 * product/variant events downstream.
 */
export async function applyProductDiffs(opts: {
  container: MedusaContainer
  diffs: ReadonlyArray<ProductDiff>
  logger: SupplierSyncLogger
  dryRun?: boolean
}): Promise<ApplySummary> {
  const { container, diffs, logger, dryRun } = opts
  const summary: ApplySummary = {
    productsUpdated: 0,
    productsUnchanged: 0,
    variantsUpdated: 0,
    variantsAdded: 0,
    errors: 0,
  }
  if (!diffs.length) return summary

  // Build the products[] payload for updateProductsWorkflow. One entry
  // per product, bundling top-level patch + variant updates.
  const productsPayload: Array<Record<string, unknown>> = []
  for (const d of diffs) {
    if (!diffHasChanges(d)) {
      summary.productsUnchanged++
      continue
    }
    const hasTopLevel = Object.keys(d.topLevelPatch).length > 0
    const hasVariantUpdates = d.variantUpdates.length > 0
    if (!hasTopLevel && !hasVariantUpdates) continue
    const entry: Record<string, unknown> = {
      id: d.productId,
      ...d.topLevelPatch,
    }
    if (hasVariantUpdates) {
      entry.variants = d.variantUpdates
    }
    productsPayload.push(entry)
  }

  // Batch-add new variants (one workflow call regardless of N products).
  const newVariants: NewVariantPayload[] = []
  for (const d of diffs) {
    for (const v of d.variantsToAdd) newVariants.push(v)
  }

  // Products whose only change is images/thumbnail aren't in productsPayload
  // (image writes go through writeProductImages, not the workflow) — count them
  // separately so the summary still reflects them.
  const payloadIds = new Set(productsPayload.map((p) => p.id as string))
  const imageOnlyDiffs = diffs.filter(
    (d) => d.imageWrite && !payloadIds.has(d.productId)
  )

  if (dryRun) {
    for (const d of diffs) {
      if (!diffHasChanges(d)) continue
      logger.info(
        `[dry-run] ${d.handle}: ${d.reasons.join(", ") || "(no human-readable reasons)"}`
      )
    }
    summary.productsUpdated = productsPayload.length + imageOnlyDiffs.length
    summary.variantsAdded = newVariants.length
    summary.variantsUpdated = productsPayload.reduce(
      (acc, p) => acc + ((p.variants as unknown[] | undefined)?.length ?? 0),
      0
    )
    return summary
  }

  // Chunk both workflow calls so a 77-style Gildan import doesn't blow
  // through Node's old-space heap building one giant input object.
  // 25 products with ~30 variant patches each is ~750 row-equivalents
  // per call — well clear of the GC working set that took down the
  // backend at 11:06.
  const UPDATE_CHUNK_SIZE = 25
  const VARIANT_CHUNK_SIZE = 100

  if (productsPayload.length) {
    for (let i = 0; i < productsPayload.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = productsPayload.slice(i, i + UPDATE_CHUNK_SIZE)
      try {
        await updateProductsWorkflow(container).run({
          input: { products: chunk as any },
        })
        summary.productsUpdated += chunk.length
        summary.variantsUpdated += chunk.reduce(
          (acc, p) => acc + ((p.variants as unknown[] | undefined)?.length ?? 0),
          0
        )
      } catch (err: any) {
        summary.errors++
        logger.warn(
          `updateProductsWorkflow chunk ${i + 1}-${i + chunk.length} failed: ${err?.message ?? err}`
        )
      }
    }
  }

  if (newVariants.length) {
    for (let i = 0; i < newVariants.length; i += VARIANT_CHUNK_SIZE) {
      const chunk = newVariants.slice(i, i + VARIANT_CHUNK_SIZE)
      try {
        await batchProductVariantsWorkflow(container).run({
          input: {
            create: chunk as any,
            update: [],
            delete: [],
          },
        })
        summary.variantsAdded += chunk.length
      } catch (err: any) {
        summary.errors++
        logger.warn(
          `batchProductVariantsWorkflow create chunk ${i + 1}-${i + chunk.length} failed: ${err?.message ?? err}`
        )
      }
    }
  }

  // Image writes — through the safe `writeProductImages` chokepoint, NOT the
  // update workflow. Each call HEAD-validates every URL (only confirmed-live
  // 200s are added), force-keeps existing live images, and never empties the
  // gallery. Sequential, one product at a time, to keep supplier-CDN load
  // modest. Image-only products are counted here; products that also had a
  // top-level/variant change were already counted by the workflow chunk.
  for (const d of diffs) {
    if (!d.imageWrite) continue
    try {
      const result = await writeProductImages(
        container,
        d.productId,
        d.imageWrite.desiredUrls,
        {
          thumbnail: d.imageWrite.thumbnail ?? undefined,
          currentUrls: d.imageWrite.currentUrls,
          logger,
        }
      )
      if (result.wrote && !payloadIds.has(d.productId)) {
        summary.productsUpdated++
      }
    } catch (err: any) {
      summary.errors++
      logger.warn(
        `writeProductImages failed for ${d.handle}: ${err?.message ?? err}`
      )
    }
  }

  // Log per-handle reasons for visibility into what changed.
  for (const d of diffs) {
    if (!diffHasChanges(d)) continue
    logger.info(`Updated ${d.handle}: ${d.reasons.join(", ")}`)
  }

  return summary
}

/**
 * Convenience entrypoint: take parallel maps of desired + existing rows
 * (keyed by handle), compute every diff, and apply them.
 *
 * Returns the apply summary plus the raw diffs so the caller can do its
 * own logging / surfacing in the admin UI.
 */
export async function applyProductUpdates(opts: {
  container: MedusaContainer
  desired: ReadonlyMap<string, DesiredProduct>
  existing: ReadonlyMap<string, ExistingProductRow>
  supplierMetaKey: string
  logger: SupplierSyncLogger
  dryRun?: boolean
}): Promise<{ summary: ApplySummary; diffs: ProductDiff[] }> {
  const { container, desired, existing, supplierMetaKey, logger, dryRun } = opts
  const diffs: ProductDiff[] = []
  for (const [handle, des] of desired) {
    const ex = existing.get(handle)
    if (!ex) continue
    diffs.push(diffProduct({ desired: des, existing: ex, supplierMetaKey }))
  }
  const summary = await applyProductDiffs({ container, diffs, logger, dryRun })
  return { summary, diffs }
}
