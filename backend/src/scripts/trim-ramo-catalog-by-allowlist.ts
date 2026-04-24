/**
 * Trim the live Ramo catalog and sync tier pricing from Medusa export-style CSV(s).
 *
 * Status:
 *   - `ramo` / `ramo-*` handles in the allowlist (Product Handle) → Published
 *   - Other Ramo products → Draft
 *
 * Default data: `data/filtered_clothing.csv` + `data/filtered_clothing_half2.csv` (merged; keys are disjoint).
 *
 * Pricing (allowlisted products only; matches by **Product Handle + Variant Title**; optional SKU match.)
 *   - Preferred: BASE_SALE_PRICE, TIER_10_TO_49_PRICE, TIER_50_TO_99_PRICE
 *   - `TIER_100_PLUS_PRICE`; if empty, `Variant Price AUD` (100+ anchor)
 *   - If any of the first three (`BASE_SALE` / T10 / T50) are missing/empty but 100+ is present, **derive** lower bands from t100 (same ladder as Syzmik when only 100+ was in the sheet): t50=t100×RAMO_DERIVE_T50 (default 1.2), t10=t50×RAMO_DERIVE_T10_FROM_T50 (default 16/15), base=t10×RAMO_DERIVE_BASE_FROM_T10 (default 4/3), in minor units (rounded).
 *   - Store prep: your sell for 100+ (e.g. cost×1.1 GST×1.5) belongs in the CSV as `Variant Price AUD` / tier columns — this script does not apply that markup in code.
 *   - Price set: qty 1–9, 10–49, 50–99, 100+
 *   - `metadata.bulk_pricing` for storefront
 *
 * Usage (from `backend/`):
 *   pnpm run trim-ramo-catalog
 *   pnpm run trim-ramo-catalog -- --apply
 *
 * Env: RAMO_ALLOWLIST_CSV (single file), RAMO_ALLOWLIST_CSVS (comma-separated), RAMO_CATALOG_TRIM_APPLY=1
 * Optional derivation multipliers: RAMO_DERIVE_T50, RAMO_DERIVE_T10_FROM_T50, RAMO_DERIVE_BASE_FROM_T10 (parseFloat)
 *
 * Post-run: revalidate storefront cache; reindex Meilisearch if enabled.
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"

import { parseCsvPriceToMedusaMinor } from "../utils/parse-money-to-minor"

type CsvRow = Record<string, string>

const PAGE_SIZE = 500
const BATCH_SIZE = 200
const PRICE_CURRENCY_CODE = "aud"

const parseEnvFloat = (key: string, fallback: number) => {
  const v = process.env[key]?.trim()
  if (!v) {
    return fallback
  }
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

const getDeriveMultipliers = () => ({
  t50OverT100: parseEnvFloat("RAMO_DERIVE_T50", 1.2),
  t10OverT50: parseEnvFloat("RAMO_DERIVE_T10_FROM_T50", 16 / 15),
  baseOverT10: parseEnvFloat("RAMO_DERIVE_BASE_FROM_T10", 4 / 3),
})

const deriveTiersFromT100Minor = (t100M: number, m: ReturnType<typeof getDeriveMultipliers>): TierMoneyMinor => {
  const t50M = Math.round(t100M * m.t50OverT100)
  const t10M = Math.round(t50M * m.t10OverT50)
  const baseM = Math.round(t10M * m.baseOverT10)
  return { base: baseM, t10: t10M, t50: t50M, t100: t100M }
}

const resolveRamoCsvPaths = (cwd: string): string[] => {
  const fromList = (process.env.RAMO_ALLOWLIST_CSVS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p))
  if (fromList.length) {
    for (const p of fromList) {
      if (!fs.existsSync(p)) {
        throw new Error(`RAMO_ALLOWLIST_CSVS path not found: ${p}`)
      }
    }
    return fromList
  }

  const single = (process.env.RAMO_ALLOWLIST_CSV || "").trim()
  if (single) {
    const resolved = path.resolve(single)
    if (!fs.existsSync(resolved)) {
      throw new Error(`RAMO_ALLOWLIST_CSV not found: ${resolved}`)
    }
    return [resolved]
  }

  const defaults = [
    path.resolve(cwd, "data", "filtered_clothing.csv"),
    path.resolve(cwd, "data", "filtered_clothing_half2.csv"),
  ]
  const found = defaults.filter((f) => fs.existsSync(f))
  if (!found.length) {
    throw new Error(
      `Ramo CSV not found. Tried: ${defaults.join(", ")}. Set RAMO_ALLOWLIST_CSV or RAMO_ALLOWLIST_CSVS.`
    )
  }
  return found
}

const csvSourceLabel = (paths: string[]) =>
  paths.length === 1 ? path.basename(paths[0]!) : paths.map((p) => path.basename(p)).join("+")

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

/**
 * Split into CSV *records* (not physical lines) so quoted fields with embedded newlines work.
 */
const splitCsvRecords = (raw: string): string[] => {
  const records: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') {
      if (inQuotes && raw[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
      continue
    }
    if (!inQuotes) {
      if (ch === "\n") {
        if (current.length > 0 || records.length > 0) {
          records.push(current)
        }
        current = ""
        continue
      }
      if (ch === "\r") {
        if (raw[i + 1] === "\n") {
          i++
        }
        if (current.length > 0 || records.length > 0) {
          records.push(current)
        }
        current = ""
        continue
      }
    }
    current += ch
  }
  if (current.length > 0 || records.length > 0) {
    records.push(current)
  }
  return records.filter((r) => r.trim().length > 0)
}

const parseCsv = (raw: string): CsvRow[] => {
  const lines = splitCsvRecords(raw)
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

const isLikelyScientificSku = (s: string) => /^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(s.trim())

const getApplyFlag = (args: string[]) =>
  args.includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.RAMO_CATALOG_TRIM_APPLY === "1" ||
  process.env.RAMO_CATALOG_TRIM_APPLY === "true"

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

const isRamoHandle = (h: string) => h === "ramo" || h.startsWith("ramo-")

const normalizeKeyPart = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

const variantRowKey = (productHandle: string, variantTitle: string) =>
  `${normalizeKeyPart(productHandle)}|${normalizeKeyPart(variantTitle)}`

type VariantRow = {
  id: string
  sku?: string
  title?: string | null
  product_id?: string
  metadata?: Record<string, unknown>
  price_set?: { id?: string }
}

const parseTierRow = (
  row: CsvRow,
  deriveMult: ReturnType<typeof getDeriveMultipliers>,
  didDerive: { value: boolean }
): TierMoneyMinor | null => {
  const vTitle = (row["Variant Title"] || "").trim()
  if (!vTitle) {
    return null
  }

  const baseM = parseCsvPriceToMedusaMinor(row["BASE_SALE_PRICE"])
  const t10M = parseCsvPriceToMedusaMinor(row["TIER_10_TO_49_PRICE"])
  const t50M = parseCsvPriceToMedusaMinor(row["TIER_50_TO_99_PRICE"])
  const t100Direct = parseCsvPriceToMedusaMinor(row["TIER_100_PLUS_PRICE"])
  const t100FromVariant = parseCsvPriceToMedusaMinor(row["Variant Price AUD"])
  const t100M = t100Direct ?? t100FromVariant

  if (t100M === null) {
    return null
  }

  if (baseM !== null && t10M !== null && t50M !== null) {
    return { base: baseM, t10: t10M, t50: t50M, t100: t100M }
  }

  didDerive.value = true
  return deriveTiersFromT100Minor(t100M, deriveMult)
}

export default async function trimRamoCatalogByAllowlist({ container, args }: ExecArgs) {
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
  const csvPaths = resolveRamoCsvPaths(process.cwd())
  const deriveMult = getDeriveMultipliers()
  let warnedDerive = false

  const dataRows: CsvRow[] = []
  for (const p of csvPaths) {
    const raw = fs.readFileSync(p, "utf-8")
    dataRows.push(...parseCsv(raw))
  }

  const allowHandles = new Set<string>()
  const tierByVariantKey = new Map<string, TierMoneyMinor>()
  const tierBySku = new Map<string, TierMoneyMinor>()
  const duplicateTitleKeys: string[] = []
  const duplicateSkus: string[] = []
  let warnedScientificSku = false
  const uniqueSkus = new Set<string>()

  for (const row of dataRows) {
    const ph = (row["Product Handle"] || "").trim().toLowerCase()
    if (ph) {
      allowHandles.add(ph)
    }
    const vTitle = (row["Variant Title"] || "").trim()
    if (!vTitle) {
      continue
    }
    const sku = (row["Variant Sku"] || "").trim()
    if (sku) {
      uniqueSkus.add(sku)
    }
    if (sku && isLikelyScientificSku(sku) && !warnedScientificSku) {
      warnedScientificSku = true
      logger.warn(
        "CSV has scientific-notation or broken Variant Sku values. " +
          "Matching prices by **Product Handle + Variant Title** instead. Re-export SKUs as text to enable SKU-based matching too."
      )
    }
    const perRowDidDerive = { value: false }
    const rowTiers = parseTierRow(row, deriveMult, perRowDidDerive)
    if (!rowTiers) {
      continue
    }
    if (perRowDidDerive.value && !warnedDerive) {
      warnedDerive = true
      logger.warn(
        "Some rows use **derived** tiers (missing BASE_SALE or T10/T50) from 100+ / Variant Price. " +
          `Multipliers: t50/t100=${deriveMult.t50OverT100}, t10/t50=${deriveMult.t10OverT50}, base/t10=${deriveMult.baseOverT10}. ` +
          "Add explicit columns in the CSV to override."
      )
    }
    const vk = variantRowKey(ph, vTitle)
    if (tierByVariantKey.has(vk)) {
      duplicateTitleKeys.push(vk)
    }
    tierByVariantKey.set(vk, rowTiers)

    if (sku && !isLikelyScientificSku(sku)) {
      if (tierBySku.has(sku)) {
        duplicateSkus.push(sku)
      }
      tierBySku.set(sku, rowTiers)
    }
  }

  if (!allowHandles.size) {
    throw new Error("No Product Handle values in CSV allowlist")
  }
  if (!tierByVariantKey.size) {
    throw new Error("No valid Product Handle + Variant Title + tier price rows in CSV (check column names and amounts)")
  }

  if (duplicateTitleKeys.length) {
    const uniq = new Set(duplicateTitleKeys)
    logger.warn(`${uniq.size} duplicate handle|VariantTitle key(s) in CSV; last row wins.`)
  }
  if (duplicateSkus.length) {
    const uniq = new Set(duplicateSkus)
    logger.warn(
      `${uniq.size} duplicate SKU(s) in CSV; last row wins. Samples: ${[...uniq].slice(0, 6).join(", ")}`
    )
  }

  const sourceLabel = csvSourceLabel(csvPaths)
  logger.info(
    `Loaded ${allowHandles.size} allowlist handle(s), ${tierByVariantKey.size} variant tier row(s) (handle + Variant Title), ` +
      `${tierBySku.size} SKU key(s) from ${sourceLabel} (${dataRows.length} data rows, ${uniqueSkus.size} unique CSV SKUs, files=${csvPaths.length}). apply=${apply}`
  )

  const ramoProducts: ProductRow[] = []
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
      if (typeof h === "string" && isRamoHandle(h)) {
        ramoProducts.push(p)
      }
    }
    pOffset += PAGE_SIZE
  }

  logger.info(`Found ${ramoProducts.length} Ramo product(s) in DB (ramo / ramo-*).`)

  let wouldPublish = 0
  let wouldDraft = 0
  let statusUnchanged = 0
  const statusSamples: string[] = []

  for (const product of ramoProducts) {
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

  const productIdToHandle = new Map<string, string>(
    ramoProducts
      .filter((p) => allowHandles.has((p.handle ?? "").trim().toLowerCase()))
      .map((p) => [p.id, (p.handle ?? "").trim().toLowerCase()])
  )

  const allowlistedProductIds = new Set(ramoProducts.filter((p) => productIdToHandle.has(p.id)).map((p) => p.id))

  const resolveTiers = (v: VariantRow): TierMoneyMinor | null => {
    const pid = v.product_id
    if (!pid) {
      return null
    }
    const h = productIdToHandle.get(pid)
    if (!h) {
      return null
    }
    const title = (v.title || "").trim()
    if (title) {
      const fromTitle = tierByVariantKey.get(variantRowKey(h, title))
      if (fromTitle) {
        return fromTitle
      }
    }
    const sku = (v.sku || "").trim()
    if (sku && tierBySku.has(sku)) {
      return tierBySku.get(sku) ?? null
    }
    return null
  }

  const variantRows: VariantRow[] = []
  for (const idBatch of chunk([...allowlistedProductIds], BATCH_SIZE)) {
    if (!idBatch.length) {
      continue
    }
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "title", "product_id", "metadata", "price_set.id"],
      filters: { product_id: idBatch },
    })
    for (const row of (data ?? []) as VariantRow[]) {
      variantRows.push(row)
    }
  }

  let matchedVariantCount = 0
  for (const v of variantRows) {
    if (resolveTiers(v)) {
      matchedVariantCount++
    }
  }

  if (matchedVariantCount < variantRows.length) {
    logger.warn(
      `Some allowlisted DB variants have no matching CSV row (by handle + title or SKU). ` +
        `unmatched ≈ ${variantRows.length - matchedVariantCount} of ${variantRows.length}. Check Variant Title / handle alignment with the export.`
    )
  }

  let newPriceSetLinks = 0
  let notInCsv = 0
  const bulkSource = sourceLabel

  for (const variant of variantRows) {
    const tiersM = resolveTiers(variant)
    if (!tiersM) {
      notInCsv++
      continue
    }
    const sku = (variant.sku || "").trim()

    const pricesForPriceSet = buildPricesForPriceSet(tiersM)
    const existingMeta = (variant.metadata ?? {}) as Record<string, unknown>
    const nextMetadata: Record<string, unknown> = {
      ...existingMeta,
      bulk_pricing: {
        source: bulkSource,
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
    `Pricing: allowlisted products=${allowlistedProductIds.size} variant rows=${variantRows.length} ` +
      `matched_for_tiers=${matchedVariantCount} no_csv_match=${notInCsv} new_price_set_links=${apply ? newPriceSetLinks : 0} apply=${apply}`
  )
  if (!apply) {
    logger.info("Dry run: no price or metadata written. Re-run with -- --apply to persist pricing.")
  } else {
    logger.info("Post-run: revalidate storefront cache; reindex Meilisearch if enabled.")
  }
}
