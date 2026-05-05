/**
 * Reads a Medusa products-import-template CSV (merged or export) and writes
 * `metadata.garment_images` (+ `garment_color`) on each variant matched by Variant SKU.
 *
 * **Why:** The storefront PDP reads `variant.metadata.garment_images` for per-colour photos.
 * Importing/updating CSV columns alone does not populate that metadata — run this after your merge.
 *
 * Uses Product Image 1 Url → front, Product Image 2 Url → back (same convention as backfill-variant-garment-images).
 *
 * Usage:
 *   APPLY_GARMENT_IMAGES_CSV=/absolute/path/to.csv npx medusa exec ./src/scripts/apply-garment-images-from-template-csv.ts
 *
 * Optional:
 *   APPLY_GARMENT_IMAGES_DRY_RUN=1   — log counts only, no writes
 */

import fs from "node:fs"
import path from "node:path"

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { resolveVariantColourFromCsvRow } from "../admin/lib/as-colour-csv-variant-colour"
import { parseCsv } from "../admin/lib/csv-import"

const csvPath = process.env.APPLY_GARMENT_IMAGES_CSV?.trim()
const dryRun = process.env.APPLY_GARMENT_IMAGES_DRY_RUN === "1"

export default async function applyGarmentImagesFromTemplateCsv({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!csvPath) {
    logger.error(
      "Set APPLY_GARMENT_IMAGES_CSV to an absolute path to your import-template CSV (e.g. merged output)."
    )
    process.exitCode = 1
    return
  }

  if (!fs.existsSync(csvPath)) {
    logger.error(`File not found: ${csvPath}`)
    process.exitCode = 1
    return
  }

  const raw = fs.readFileSync(csvPath, "utf8")
  const parsed = parseCsv(raw)

  if (!parsed.headers.includes("variant sku")) {
    logger.error("CSV must include Variant Sku column.")
    process.exitCode = 1
    return
  }

  const productModuleService = container.resolve(Modules.PRODUCT) as unknown as {
    updateProductVariants?: (id: string, data: { metadata?: Record<string, unknown> }) => Promise<unknown>
  }

  if (typeof productModuleService.updateProductVariants !== "function") {
    logger.error("Product module updateProductVariants is unavailable.")
    process.exitCode = 1
    return
  }

  type RowData = {
    sku: string
    front?: string
    back?: string
    color?: string
  }

  const bySku = new Map<string, RowData>()

  for (const row of parsed.rows) {
    const sku = (row["variant sku"] ?? "").trim()
    if (!sku) {
      continue
    }
    const img1 = (row["product image 1 url"] ?? "").trim()
    const img2 = (row["product image 2 url"] ?? "").trim()
    const color = resolveVariantColourFromCsvRow(row)

    if (!img1 && !img2) {
      continue
    }

    bySku.set(sku, {
      sku,
      front: img1 || undefined,
      back: img2 || undefined,
      color,
    })
  }

  logger.info(
    `Parsed ${bySku.size} variant SKU row(s) with image and/or colour data from ${path.basename(csvPath)}`
  )

  const skus = Array.from(bySku.keys())
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata"],
    filters: {
      sku: skus,
    },
  })

  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []

  for (const variant of variants ?? []) {
    const sku = (variant as { sku?: string }).sku
    if (!sku) {
      continue
    }
    const csvRow = bySku.get(sku)
    if (!csvRow) {
      continue
    }

    const existingMetadata = ((variant as { metadata?: Record<string, unknown> }).metadata ??
      {}) as Record<string, unknown>

    const garment_images = {
      front: csvRow.front,
      back: csvRow.back,
      all: [csvRow.front, csvRow.back].filter(Boolean),
    }

    const mergedMetadata: Record<string, unknown> = {
      ...existingMetadata,
      ...(csvRow.color ? { garment_color: csvRow.color } : {}),
      garment_images,
    }

    updates.push({
      id: (variant as { id: string }).id,
      metadata: mergedMetadata,
    })
  }

  logger.info(`Matched ${updates.length} variant(s) in the database (of ${bySku.size} SKU rows in file).`)

  if (dryRun) {
    logger.info("APPLY_GARMENT_IMAGES_DRY_RUN=1 — no writes.")
    return
  }

  if (!updates.length) {
    logger.info("Nothing to update.")
    return
  }

  for (const u of updates) {
    await productModuleService.updateProductVariants!(u.id, { metadata: u.metadata })
  }

  logger.info(`Updated metadata on ${updates.length} variant(s).`)
}
