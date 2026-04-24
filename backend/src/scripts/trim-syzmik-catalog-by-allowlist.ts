/**
 * Trim the live Syzmik catalog and sync tier pricing from a Medusa export-style CSV.
 *
 * Status:
 *   - `syzmik` / `syzmik-*` handles in the allowlist (Product Handle) → Published
 *   - Other Syzmik products → Draft
 *
 * Pricing (per `Variant Sku` on allowlisted products only):
 *   - BASE_SALE_PRICE, TIER_10_TO_49_PRICE, TIER_50_TO_99_PRICE
 *   - TIER_100_PLUS; if empty, `Variant Price AUD` (100+ anchor)
 *   - Price set: qty 1–9, 10–49, 50–99, 100+ (same as `update-as-colour-pricing.ts`)
 *   - `metadata.bulk_pricing` for storefront
 *
 * Usage (from `backend/`):
 *   pnpm run trim-syzmik-catalog
 *   pnpm run trim-syzmik-catalog -- --apply
 *
 * Env: SYZMIK_ALLOWLIST_CSV, SYZMIK_CATALOG_TRIM_APPLY=1
 *
 * This script only affects `syzmik` / `syzmik-*` products — not AS Colour.
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"

type CsvRow = Record<string, string>

const PAGE_SIZE = 500
const BATCH_SIZE = 200
const PRICE_CURRENCY_CODE = "aud"

const DEFAULT_SYZMIK_CSV_CANDIDATES = [
  process.env.SYZMIK_ALLOWLIST_CSV?.trim() || "",
  path.resolve(process.cwd(), "data", "filtered_syzmik_products.csv"),
  path.resolve(process.cwd(), "..", "filtered_syzmik_products.csv"),
].filter(Boolean)

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

const resolveExistingPath = (candidates: string[], label: string) => {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (fs.existsSync(resolved)) {
      return resolved
    }
  }

  throw new Error(
    `${label} not found. Tried: ${candidates.map((p) => path.resolve(p)).join(", ")}`
  )
}

const parseMoneyToMinor = (value?: string): number | null => {
  if (!value) {
    return null
  }

  const normalized = value.replace(/[^0-9.-]/g, "")
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.round(parsed * 100)
}

const isLikelyScientificSku = (s: string) => /^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(s.trim())

const getApplyFlag = (args: string[]) =>
  args.includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.SYZMIK_CATALOG_TRIM_APPLY === "1" ||
  process.env.SYZMIK_CATALOG_TRIM_APPLY === "true"

const chunk = <T>(items: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

type ProductRow = {
  id: string
  handle?: string | null
  status?: string | null
}

type TierMoneyMinor = {
  base: number
  t10: number
  t50: number
  t100: number
}

const buildPricesForPriceSet = (m: TierMoneyMinor): Array<Record<string, unknown>> => [
  { amount: m.base, currency_code: PRICE_CURRENCY_CODE, min_quantity: 1, max_quantity: 9 },
  { amount: m.t10, currency_code: PRICE_CURRENCY_CODE, min_quantity: 10, max_quantity: 49 },
  { amount: m.t50, currency_code: PRICE_CURRENCY_CODE, min_quantity: 50, max_quantity: 99 },
  { amount: m.t100, currency_code: PRICE_CURRENCY_CODE, min_quantity: 100 },
]

const isSyzmikHandle = (h: string) => h === "syzmik" || h.startsWith("syzmik-")

type VariantRow = {
  id: string
  sku?: string
  product_id?: string
  metadata?: Record<string, unknown>
  price_set?: { id?: string }
}

export default async function trimSyzmikCatalogByAllowlist({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }
  const link = container.resolve(ContainerRegistrationKeys.LINK) as {
    create: (data: Record<string, unknown>) => Promise<unknown>
  }
  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: { status?: string }) => Promise<unknown>
    updateProductVariants: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  const pricingModuleService = container.resolve(Modules.PRICING) as {
    upsertPriceSets: (data: Array<Record<string, unknown>>) => Promise<unknown>
  }

  if (typeof productModule.updateProductVariants !== "function") {
    throw new Error("updateProductVariants is not available on product module")
  }
  if (typeof pricingModuleService.upsertPriceSets !== "function") {
    throw new Error("upsertPriceSets is not available on pricing module")
  }

  const apply = getApplyFlag(args ?? [])
  const csvPath = resolveExistingPath(DEFAULT_SYZMIK_CSV_CANDIDATES, "Syzmik CSV")
  const rawCsv = fs.readFileSync(csvPath, "utf-8")
  const dataRows = parseCsv(rawCsv)

  const allowHandles = new Set<string>()
  const skuTiers = new Map<string, TierMoneyMinor>()
  const duplicateSkus: string[] = []

  for (const row of dataRows) {
    const ph = (row["Product Handle"] || "").trim().toLowerCase()
    if (ph) {
      allowHandles.add(ph)
    }
    const sku = (row["Variant Sku"] || "").trim()
    if (!sku) {
      continue
    }
    if (isLikelyScientificSku(sku)) {
      logger.warn(
        `Variant Sku may not match Medusa (scientific-notation like export): ${sku} — re-export with text or fix barcodes.`
      )
    }
    const baseM = parseMoneyToMinor(row["BASE_SALE_PRICE"])
    const t10M = parseMoneyToMinor(row["TIER_10_TO_49_PRICE"])
    const t50M = parseMoneyToMinor(row["TIER_50_TO_99_PRICE"])
    const t100Direct = parseMoneyToMinor(row["TIER_100_PLUS_PRICE"])
    const t100FromVariant = parseMoneyToMinor(row["Variant Price AUD"])
    const t100M = t100Direct ?? t100FromVariant

    if (baseM === null || t10M === null || t50M === null || t100M === null) {
      continue
    }

    if (skuTiers.has(sku)) {
      duplicateSkus.push(sku)
    }
    skuTiers.set(sku, { base: baseM, t10: t10M, t50: t50M, t100: t100M })
  }

  if (!allowHandles.size) {
    throw new Error("No Product Handle values in CSV allowlist")
  }
  if (!skuTiers.size) {
    throw new Error("No valid SKU + tier price rows in CSV (check column names and amounts)")
  }

  if (duplicateSkus.length) {
    const uniq = Array.from(new Set(duplicateSkus))
    logger.warn(
      `${uniq.length} duplicate SKU(s) in CSV; last row wins. Samples: ${uniq.slice(0, 8).join(", ")}`
    )
  }

  logger.info(
    `Loaded ${allowHandles.size} allowlist handle(s), ${skuTiers.size} priced SKU(s) from ${path.basename(csvPath)} (${dataRows.length} data rows). apply=${apply}`
  )

  const syzmikProducts: ProductRow[] = []
  let pOffset = 0
  while (true) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "status"],
      pagination: { take: PAGE_SIZE, skip: pOffset },
    })
    const batch = (page ?? []) as ProductRow[]
    if (!batch.length) {
      break
    }
    for (const p of batch) {
      const h = p.handle
      if (typeof h === "string" && isSyzmikHandle(h)) {
        syzmikProducts.push(p)
      }
    }
    pOffset += PAGE_SIZE
  }

  logger.info(`Found ${syzmikProducts.length} Syzmik product(s) in DB (syzmik / syzmik-*).`)

  let wouldPublish = 0
  let wouldDraft = 0
  let statusUnchanged = 0
  const statusSamples: string[] = []

  for (const product of syzmikProducts) {
    const handle = (product.handle ?? "").trim().toLowerCase()
    const inList = allowHandles.has(handle)
    const targetStatus = inList ? ProductStatus.PUBLISHED : ProductStatus.DRAFT
    const current = (product.status ?? "").toLowerCase()
    const targetLower = String(targetStatus).toLowerCase()

    if (current === targetLower) {
      statusUnchanged++
      continue
    }
    if (inList) {
      wouldPublish++
    } else {
      wouldDraft++
    }
    if (!apply && statusSamples.length < 25) {
      statusSamples.push(`${targetStatus} <- ${current || "?"}  ${product.handle ?? ""}`)
    }
    if (apply) {
      await productModule.updateProducts(product.id, { status: targetStatus })
    }
  }

  logger.info(
    `Status: apply=${apply} would_publish=${wouldPublish} would_draft=${wouldDraft} unchanged=${statusUnchanged}`
  )
  if (!apply && (wouldPublish > 0 || wouldDraft > 0)) {
    for (const line of statusSamples) {
      logger.info(`  ${line}`)
    }
    logger.info("Re-run with --apply to persist status.")
  }

  const allowlistedProductIds = new Set(
    syzmikProducts
      .filter((p) => allowHandles.has((p.handle ?? "").trim().toLowerCase()))
      .map((p) => p.id)
  )

  const variantRows: VariantRow[] = []
  for (const idBatch of chunk([...allowlistedProductIds], BATCH_SIZE)) {
    if (!idBatch.length) {
      continue
    }
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "product_id", "metadata", "price_set.id"],
      filters: { product_id: idBatch },
    })
    for (const row of (data ?? []) as VariantRow[]) {
      variantRows.push(row)
    }
  }

  let matchedVariantCount = 0
  for (const v of variantRows) {
    const sku = (v.sku || "").trim()
    if (sku && skuTiers.has(sku)) {
      matchedVariantCount++
    }
  }

  const missingInDb: string[] = []
  for (const sku of skuTiers.keys()) {
    if (!variantRows.some((v) => (v.sku || "").trim() === sku)) {
      if (missingInDb.length < 50) {
        missingInDb.push(sku)
      }
    }
  }
  if (missingInDb.length) {
    logger.warn(
      `SKUs in CSV with tier prices but not found on allowlisted Syzmik variants: at least ${missingInDb.length} (sample of ${Math.min(20, missingInDb.length)} below).`
    )
    for (const s of missingInDb.slice(0, 20)) {
      logger.warn(`  ${s}`)
    }
  }

  let newPriceSetLinks = 0
  let noSku = 0
  let notInCsv = 0

  for (const variant of variantRows) {
    const sku = (variant.sku || "").trim()
    if (!sku) {
      noSku++
      continue
    }
    const tiersM = skuTiers.get(sku)
    if (!tiersM) {
      notInCsv++
      continue
    }

    const pricesForPriceSet = buildPricesForPriceSet(tiersM)
    const existingMeta = (variant.metadata ?? {}) as Record<string, unknown>
    const nextMetadata: Record<string, unknown> = {
      ...existingMeta,
      bulk_pricing: {
        source: path.basename(csvPath),
        currency_code: PRICE_CURRENCY_CODE,
        tiers: [
          { min_quantity: 1, max_quantity: 9, amount: tiersM.base },
          { min_quantity: 10, max_quantity: 49, amount: tiersM.t10 },
          { min_quantity: 50, max_quantity: 99, amount: tiersM.t50 },
          { min_quantity: 100, amount: tiersM.t100 },
        ],
      },
    }

    if (!apply) {
      continue
    }

    const priceSetId = variant.price_set?.id
    if (priceSetId) {
      await pricingModuleService.upsertPriceSets([{ id: priceSetId, prices: pricesForPriceSet }])
      await productModule.updateProductVariants(variant.id, { metadata: nextMetadata })
    } else {
      const created = (await pricingModuleService.upsertPriceSets([{ prices: pricesForPriceSet }])) as Array<{
        id?: string
      }>
      const newId = created[0]?.id
      if (!newId) {
        throw new Error(`Failed to create price set for variant ${variant.id} (sku ${sku})`)
      }
      await link.create({
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.PRICING]: { price_set_id: newId },
      })
      newPriceSetLinks++
      await productModule.updateProductVariants(variant.id, { metadata: nextMetadata })
    }
  }

  logger.info(
    `Pricing: allowlisted products=${allowlistedProductIds.size} variant rows=${variantRows.length} with_csv_tier_prices=${matchedVariantCount} no_sku=${noSku} not_in_csv=${notInCsv} new_price_set_links=${apply ? newPriceSetLinks : 0} apply=${apply}`
  )
  if (!apply) {
    logger.info("Dry run: no price or metadata written. Re-run with -- --apply to persist pricing.")
  } else {
    logger.info(
      "Post-run: Vercel/Next may cache the catalog. Revalidate or wait; reindex Meilisearch if enabled."
    )
  }
}
