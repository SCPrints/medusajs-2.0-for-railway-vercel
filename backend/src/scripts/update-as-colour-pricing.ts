import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type CsvRow = Record<string, string>

type Tier = {
  min_quantity: number
  max_quantity?: number
  amount: number
}

type StylePricing = {
  styleCode: string
  costPriceMinor: number | null
  tiers: Tier[]
}

const DEFAULT_PRICE_CSV_CANDIDATES = [
  process.env.AS_COLOUR_PRICE_CSV?.trim() || "",
  path.resolve(process.cwd(), "data", "as_colour_higher_base_tiers.csv"),
  path.resolve(process.cwd(), "../as_colour_higher_base_tiers.csv"),
].filter(Boolean)

const DEFAULT_IMPORT_CSV_CANDIDATES = [
  process.env.AS_COLOUR_IMPORT_CSV?.trim() || "",
  path.resolve(process.cwd(), "data", "as_colour_medusa_import.csv"),
  path.resolve(process.cwd(), "../as_colour_medusa_import.csv"),
].filter(Boolean)

const BATCH_SIZE = 250
const PRICE_CURRENCY_CODE = "aud"

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

const normalizeStyleCode = (value?: string) => value?.trim().toUpperCase() || ""

const extractStyleCodeCandidatesFromSku = (sku?: string) => {
  if (!sku) {
    return []
  }

  const normalized = sku.trim().toUpperCase()
  if (!normalized) {
    return []
  }

  const tokens = normalized
    .split("-")
    .map((token) => token.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean)

  const candidates = new Set<string>()
  for (const token of tokens.slice(0, 3)) {
    candidates.add(token)
  }

  if (tokens[0]?.startsWith("ASC") && tokens[0].length > 3) {
    candidates.add(tokens[0].slice(3))
  }

  return Array.from(candidates)
}

const chunk = <T>(items: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

const getApplyFlag = (args: string[]) =>
  args.includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.AS_COLOUR_PRICING_APPLY === "1" ||
  process.env.AS_COLOUR_PRICING_APPLY === "true"

const buildStylePricingMap = (rows: CsvRow[]) => {
  const byStyleCode = new Map<string, StylePricing>()
  const duplicateStyleCodes = new Set<string>()

  for (const row of rows) {
    const styleCode = normalizeStyleCode(row["STYLECODE"])
    if (!styleCode) {
      continue
    }

    const baseSaleMinor = parseMoneyToMinor(row["BASE_SALE_PRICE"])
    const tier10Minor = parseMoneyToMinor(row["TIER_10_TO_49_PRICE"])
    const tier50Minor = parseMoneyToMinor(row["TIER_50_TO_99_PRICE"])
    const tier100Minor = parseMoneyToMinor(row["TIER_100_PLUS_PRICE"])

    if (baseSaleMinor === null) {
      continue
    }

    const tiers: Tier[] = [{ min_quantity: 1, max_quantity: 9, amount: baseSaleMinor }]

    if (tier10Minor !== null) {
      tiers.push({ min_quantity: 10, max_quantity: 49, amount: tier10Minor })
    }
    if (tier50Minor !== null) {
      tiers.push({ min_quantity: 50, max_quantity: 99, amount: tier50Minor })
    }
    if (tier100Minor !== null) {
      tiers.push({ min_quantity: 100, amount: tier100Minor })
    }

    const stylePricing: StylePricing = {
      styleCode,
      costPriceMinor: parseMoneyToMinor(row["PRICE"]),
      tiers,
    }

    if (byStyleCode.has(styleCode)) {
      duplicateStyleCodes.add(styleCode)
    }

    byStyleCode.set(styleCode, stylePricing)
  }

  return {
    byStyleCode,
    duplicateStyleCodes: Array.from(duplicateStyleCodes),
  }
}

const parseSkuSetFromAsColourImport = (rows: CsvRow[]) => {
  const skuSet = new Set<string>()

  for (const row of rows) {
    const handle = row["Product Handle"]?.trim().toLowerCase()
    const sku = row["Variant Sku"]?.trim()
    if (!sku || !handle?.startsWith("as-colour-")) {
      continue
    }
    skuSet.add(sku)
  }

  return Array.from(skuSet)
}

export default async function updateAsColourPricing({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }
  const productModuleService = container.resolve(Modules.PRODUCT) as {
    updateProductVariants: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  const pricingModuleService = container.resolve(Modules.PRICING) as {
    upsertPriceSets: (data: Array<Record<string, unknown>>) => Promise<unknown>
  }

  if (typeof productModuleService.updateProductVariants !== "function") {
    throw new Error("Product module method updateProductVariants is unavailable")
  }
  if (typeof pricingModuleService.upsertPriceSets !== "function") {
    throw new Error("Pricing module method upsertPriceSets is unavailable")
  }

  const apply = getApplyFlag(args)
  const priceCsvPath = resolveExistingPath(
    args[0] ? [args[0], ...DEFAULT_PRICE_CSV_CANDIDATES] : DEFAULT_PRICE_CSV_CANDIDATES,
    "AS Colour price CSV"
  )
  const importCsvPath = resolveExistingPath(DEFAULT_IMPORT_CSV_CANDIDATES, "AS Colour import CSV")

  logger.info(`Mode: ${apply ? "APPLY" : "DRY RUN"} (pass -- --apply to write changes)`)
  logger.info(`Price CSV: ${priceCsvPath}`)
  logger.info(`Import CSV: ${importCsvPath}`)

  const pricingRows = parseCsv(fs.readFileSync(priceCsvPath, "utf8"))
  const importRows = parseCsv(fs.readFileSync(importCsvPath, "utf8"))

  const { byStyleCode, duplicateStyleCodes } = buildStylePricingMap(pricingRows)
  const asColourSkus = parseSkuSetFromAsColourImport(importRows)

  if (!byStyleCode.size) {
    throw new Error("No valid style pricing rows found in price CSV")
  }

  if (!asColourSkus.length) {
    throw new Error("No AS Colour SKUs found in import CSV")
  }

  if (duplicateStyleCodes.length) {
    logger.warn(
      `Duplicate STYLECODE values found in pricing CSV. Last row wins for: ${duplicateStyleCodes.join(", ")}`
    )
  }

  logger.info(`Loaded ${byStyleCode.size} style price rows and ${asColourSkus.length} AS Colour SKUs`)

  const skuBatches = chunk(asColourSkus, BATCH_SIZE)
  const variantRows: Array<{
    id: string
    sku: string
    metadata?: Record<string, unknown>
    price_set?: { id?: string }
  }> = []

  for (const skuBatch of skuBatches) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "metadata", "price_set.id"],
      filters: {
        sku: skuBatch,
      },
    })

    for (const row of (data ?? []) as Array<{
      id: string
      sku: string
      metadata?: Record<string, unknown>
      price_set?: { id?: string }
    }>) {
      variantRows.push(row)
    }
  }

  if (!variantRows.length) {
    throw new Error("No matching product variants found in database for AS Colour SKUs")
  }

  const foundSkuSet = new Set(variantRows.map((variant) => variant.sku))
  const missingSkuCount = asColourSkus.filter((sku) => !foundSkuSet.has(sku)).length
  if (missingSkuCount) {
    logger.warn(`SKUs present in import CSV but not in DB: ${missingSkuCount}`)
  }

  let matchedStyleCount = 0
  let updatedVariantCount = 0
  let skippedVariantCount = 0

  for (const variant of variantRows) {
    const metadataStyleCode = normalizeStyleCode(
      (variant.metadata as Record<string, unknown> | undefined)?.as_colour_style_code as string | undefined
    )
    const styleCandidates = [
      metadataStyleCode,
      ...extractStyleCodeCandidatesFromSku(variant.sku),
    ].filter(Boolean)

    const resolvedStyleCode = styleCandidates.find((candidate) => byStyleCode.has(candidate))
    const stylePricing = resolvedStyleCode ? byStyleCode.get(resolvedStyleCode) : undefined
    if (!stylePricing) {
      skippedVariantCount++
      continue
    }
    const priceSetId = variant.price_set?.id
    if (!priceSetId) {
      skippedVariantCount++
      continue
    }

    matchedStyleCount++

    const existingMetadata = (variant.metadata ?? {}) as Record<string, unknown>
    const nextMetadata: Record<string, unknown> = {
      ...existingMetadata,
      bulk_pricing: {
        source: "as_colour_higher_base_tiers.csv",
        currency_code: PRICE_CURRENCY_CODE,
        tiers: stylePricing.tiers,
      },
      as_colour_style_code: stylePricing.styleCode,
    }

    if (stylePricing.costPriceMinor !== null) {
      nextMetadata.as_colour_cost_price_ex_gst = stylePricing.costPriceMinor
    }

    const pricesForPriceSet: Array<Record<string, unknown>> = stylePricing.tiers.map((tier) => ({
      amount: tier.amount,
      currency_code: PRICE_CURRENCY_CODE,
      min_quantity: tier.min_quantity,
      ...(typeof tier.max_quantity === "number" ? { max_quantity: tier.max_quantity } : {}),
    }))

    if (!apply) {
      continue
    }

    await pricingModuleService.upsertPriceSets([
      {
        id: priceSetId,
        prices: pricesForPriceSet,
      },
    ])

    await productModuleService.updateProductVariants(variant.id, {
      metadata: nextMetadata,
    })
    updatedVariantCount++
  }

  logger.info(
    `Matched ${matchedStyleCount} variants to style pricing rows. Skipped ${skippedVariantCount} variants with no STYLECODE match.`
  )

  if (apply) {
    logger.info(`Updated ${updatedVariantCount} variant prices with quantity tiers and metadata.`)
  } else {
    logger.info("Dry run complete. Re-run with -- --apply to persist price updates.")
  }
}
