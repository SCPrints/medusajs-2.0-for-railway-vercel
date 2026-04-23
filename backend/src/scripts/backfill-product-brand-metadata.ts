/**
 * Backfill `metadata.brand` on products from a Medusa product export CSV (variant rows).
 *
 * Usage (from `backend/`):
 *   PRODUCT_EXPORT_CSV=/absolute/path/to/export.csv npx medusa exec ./src/scripts/backfill-product-brand-metadata.ts
 *   PRODUCT_EXPORT_CSV=... npx medusa exec ./src/scripts/backfill-product-brand-metadata.ts -- --apply
 *
 * Env:
 *   PRODUCT_EXPORT_CSV — required path to CSV (columns: Product Id, Product Handle, Product Title)
 *   BACKFILL_BRAND_APPLY=1 — same as `--apply` (writes to DB)
 *   BACKFILL_BRAND_OVERWRITE=1 — replace existing metadata.brand when it differs from inferred
 *   BACKFILL_BRAND_VERBOSE=1 — in dry run, log up to 20 example rows
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type CsvRow = Record<string, string>

const parseCsvLine = (line: string): string[] => {
  const out: string[] = []
  let value = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        value += "\""
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === "," && !inQuotes) {
      out.push(value)
      value = ""
      continue
    }

    value += ch
  }

  out.push(value)
  return out
}

const parseCsv = (raw: string): CsvRow[] => {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (!lines.length) {
    return []
  }

  const headers = parseCsvLine(lines[0])

  return lines.slice(1).map((line) => {
    const parts = parseCsvLine(line)
    const row: CsvRow = {}
    headers.forEach((header, idx) => {
      row[header] = (parts[idx] ?? "").trim()
    })
    return row
  })
}

function resolveCsvPath(): string {
  const fromEnv = process.env.PRODUCT_EXPORT_CSV?.trim()
  if (fromEnv) {
    return path.resolve(fromEnv)
  }
  const fallback = path.join(process.cwd(), "data", "product-export.csv")
  if (fs.existsSync(fallback)) {
    return fallback
  }
  throw new Error(
    `Set PRODUCT_EXPORT_CSV to your Medusa export CSV path, or place product-export.csv in backend/data/.`
  )
}

/** Longest handle prefix first so `biz-collection` wins over `biz`. */
const HANDLE_PREFIX_BRAND: Array<{ prefix: string; brand: string }> = [
  { prefix: "american-apparel", brand: "American Apparel" },
  { prefix: "biz-collection", brand: "Biz Collection" },
  { prefix: "next-level", brand: "Next Level" },
  { prefix: "stanley-stella", brand: "Stanley/Stella" },
  { prefix: "as-colour", brand: "AS Colour" },
  { prefix: "grace", brand: "Grace Collection" },
  { prefix: "dnc", brand: "DNC Workwear" },
  { prefix: "ramo", brand: "Ramo" },
  { prefix: "gildan", brand: "Gildan" },
  { prefix: "syzmik", brand: "Syzmik" },
  { prefix: "anvil", brand: "Anvil" },
  { prefix: "champion", brand: "Champion" },
  { prefix: "patagonia", brand: "Patagonia" },
  { prefix: "stanley", brand: "Stanley/Stella" },
].sort((a, b) => b.prefix.length - a.prefix.length)

function brandFromHandle(handle: string): string | null {
  const h = handle.trim().toLowerCase()
  for (const { prefix, brand } of HANDLE_PREFIX_BRAND) {
    if (h === prefix || h.startsWith(`${prefix}-`)) {
      return brand
    }
  }
  return null
}

/** Title starts with these phrases (longest first). */
const TITLE_LEADING_BRAND: Array<{ phrase: string; brand: string }> = [
  { phrase: "biz collection", brand: "Biz Collection" },
  { phrase: "american apparel", brand: "American Apparel" },
  { phrase: "grace collection", brand: "Grace Collection" },
  { phrase: "dnc workwear", brand: "DNC Workwear" },
  { phrase: "as colour", brand: "AS Colour" },
  { phrase: "next level", brand: "Next Level" },
  { phrase: "stanley/stella", brand: "Stanley/Stella" },
  { phrase: "ramo", brand: "Ramo" },
  { phrase: "gildan", brand: "Gildan" },
  { phrase: "syzmik", brand: "Syzmik" },
  { phrase: "anvil", brand: "Anvil" },
  { phrase: "champion", brand: "Champion" },
  { phrase: "patagonia", brand: "Patagonia" },
].sort((a, b) => b.phrase.length - a.phrase.length)

function brandFromTitle(title: string): string | null {
  const t = title.trim().toLowerCase()
  for (const { phrase, brand } of TITLE_LEADING_BRAND) {
    if (t.startsWith(phrase)) {
      return brand
    }
  }
  return null
}

function inferBrand(handle: string, title: string): string | null {
  return brandFromHandle(handle) ?? brandFromTitle(title)
}

const PRODUCT_ID_KEYS = ["Product Id", "product_id", "product id"]
const HANDLE_KEYS = ["Product Handle", "product_handle", "product handle"]
const TITLE_KEYS = ["Product Title", "product_title", "product title"]

function cell(row: CsvRow, keys: string[]): string {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).length) {
      return String(row[k]).trim()
    }
  }
  for (const [key, value] of Object.entries(row)) {
    const nk = key.toLowerCase()
    for (const want of keys) {
      if (nk === want.toLowerCase()) {
        return String(value).trim()
      }
    }
  }
  return ""
}

export default async function backfillProductBrandMetadata({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const args = process.argv
  const apply =
    args.includes("--apply") ||
    process.env.BACKFILL_BRAND_APPLY === "1" ||
    process.env.BACKFILL_BRAND_APPLY === "true"
  const overwrite =
    process.env.BACKFILL_BRAND_OVERWRITE === "1" || process.env.BACKFILL_BRAND_OVERWRITE === "true"
  const verbose =
    process.env.BACKFILL_BRAND_VERBOSE === "1" || process.env.BACKFILL_BRAND_VERBOSE === "true"

  const productModule = container.resolve(Modules.PRODUCT) as {
    retrieveProduct: (
      id: string,
      config?: { select?: string[] }
    ) => Promise<{ id: string; metadata?: Record<string, unknown> | null }>
    updateProducts: (
      id: string,
      data: { metadata?: Record<string, unknown> }
    ) => Promise<unknown>
  }

  const csvPath = resolveCsvPath()
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`)
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"))
  if (!rows.length) {
    logger.info("No data rows in CSV; nothing to do.")
    return
  }

  const byProductId = new Map<string, { handle: string; title: string }>()
  for (const row of rows) {
    const productId = cell(row, PRODUCT_ID_KEYS)
    if (!productId) {
      continue
    }
    if (byProductId.has(productId)) {
      continue
    }
    const handle = cell(row, HANDLE_KEYS)
    const title = cell(row, TITLE_KEYS)
    byProductId.set(productId, { handle, title })
  }

  logger.info(
    `Mode: ${apply ? "APPLY" : "DRY RUN"} (pass -- --apply or BACKFILL_BRAND_APPLY=1 to write)`
  )
  logger.info(`CSV: ${csvPath}`)
  logger.info(`Unique products in export: ${byProductId.size}`)

  let wouldSet = 0
  let skippedUnmatched = 0
  let skippedUnchanged = 0
  let skippedConflicting = 0
  const unmatchedSamples: string[] = []
  let dryRunLogged = 0

  for (const [productId, { handle, title }] of byProductId) {
    const inferred = inferBrand(handle, title)
    if (!inferred) {
      skippedUnmatched++
      if (unmatchedSamples.length < 15) {
        unmatchedSamples.push(`${productId} handle=${handle || "?"}`)
      }
      continue
    }

    const existing = await productModule.retrieveProduct(productId, {
      select: ["id", "metadata"],
    })
    const meta = (existing?.metadata ?? {}) as Record<string, unknown>
    const currentBrand = typeof meta.brand === "string" ? meta.brand.trim() : ""

    if (currentBrand === inferred) {
      skippedUnchanged++
      continue
    }

    if (currentBrand && currentBrand !== inferred) {
      if (!overwrite) {
        skippedConflicting++
        logger.warn(
          `Skip ${productId}: metadata.brand already "${currentBrand}" (inferred "${inferred}"; set BACKFILL_BRAND_OVERWRITE=1 to replace)`
        )
        continue
      }
    }

    wouldSet++
    if (apply) {
      await productModule.updateProducts(productId, {
        metadata: {
          ...meta,
          brand: inferred,
        },
      })
    } else if (verbose && dryRunLogged < 20) {
      dryRunLogged++
      logger.info(`[dry-run] ${productId} -> brand=${JSON.stringify(inferred)} (handle=${handle})`)
    }
  }

  logger.info(
    `Summary: apply=${apply} set=${wouldSet} unchanged=${skippedUnchanged} unmatched=${skippedUnmatched} conflicting_skipped=${skippedConflicting}`
  )
  if (unmatchedSamples.length) {
    logger.warn("Sample product ids with no brand inference (add handle/title rules or set metadata in Admin):")
    for (const s of unmatchedSamples) {
      logger.warn(`  ${s}`)
    }
  }
}
