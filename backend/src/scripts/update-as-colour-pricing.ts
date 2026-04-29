import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { parseMoneyToMinor } from "../utils/parse-money-to-minor"
import {
  AsColourStylePricing,
  AsColourPriceTier,
  buildExplicitStylePricingMapFromCsvRows,
  normalizeStyleCode,
  parseExtendedSizeBandFromProductName,
  resolveStylePricingForHandlesAndSku,
  stylePricingLookupKey,
} from "../utils/as-colour-explicit-pricing-from-csv"
import { tiersFromCostMinor } from "../utils/as-colour-tier-math"

/**
 * Updates AS Colour variant price sets (AUD, qty tiers) and `bulk_pricing` metadata.
 *
 * Gold / supplier cost sheet: pass `--from-gold-cost` and a CSV with `STYLECODE` + `PRICE`
 * (ex-GST cost per style). Tiers are derived; optional `PRODUCT_NAME` with "(4XL)" / "(5XL)" for extended SKUs.
 *
 * Legacy sheet: omit `--from-gold-cost` and supply `BASE_SALE_PRICE`, `TIER_10_TO_49_PRICE`, etc.
 *
 * Scoping: set `AS_COLOUR_IMPORT_CSV` or use `data/as_colour_medusa_import.csv` with `Product Handle` + `Variant Sku`
 * for `as-colour-*` products (any columns; only handle/sku used for which variants to touch).
 *
 * `npm run update-as-colour-pricing -- --from-gold-cost /path/to/gold.csv` (add `-- --apply` to persist).
 * (`--from-gold-csv`, `--gold`, and `--from-gold-csv=/abs/path.csv` work. `--file` / `--price-csv` set the price sheet path.)
 * A sheet with `STYLECODE` + `PRICE` but no `BASE_SALE_PRICE` values is **auto-treated as gold** (five tiers).
 */

type CsvRow = Record<string, string>

type Tier = AsColourPriceTier

type StylePricing = AsColourStylePricing

const DEFAULT_PRICE_CSV_CANDIDATES = [
  process.env.AS_COLOUR_PRICE_CSV?.trim() || "",
  path.resolve(process.cwd(), "data", "as_colour_final_website_pricing.csv"),
  path.resolve(process.cwd(), "data", "as_colour_higher_base_tiers.csv"),
  path.resolve(process.cwd(), "../as_colour_final_website_pricing.csv"),
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

const chunk = <T>(items: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

/**
 * `npm run … -- …` and `medusa exec … -- …` put user flags after `--`.
 * Medusa often passes an empty `args` array, so we also read `process.argv`.
 */
const argvAfterDoubleDash = (): string[] => {
  const i = process.argv.findIndex((a) => a === "--")
  return i >= 0 ? process.argv.slice(i + 1) : []
}

const mergeScriptArgv = (execArgs: unknown): string[] => {
  const fromExec = Array.isArray(execArgs)
    ? execArgs.filter((a): a is string => typeof a === "string")
    : []
  return [...fromExec, ...argvAfterDoubleDash()]
}

/**
 * `--from-gold-csv=/path/file.csv` is one shell token; split so the flag and path parse correctly.
 */
const normalizeGoldCostArgv = (tokens: string[]): string[] => {
  const out: string[] = []
  for (const t of tokens) {
    const m = t.match(/^--from-gold-(?:cost|csv)=(.*)$/)
    if (m) {
      out.push("--from-gold-cost", (m[1] ?? "").trim())
      continue
    }
    out.push(t)
  }
  return out
}

/**
 * `--file` / `--price-csv` set the supplier price spreadsheet path (same as first positional arg).
 */
const extractExplicitPriceCsvPath = (tokens: string[]): { rest: string[]; path?: string } => {
  const rest: string[] = []
  let path: string | undefined
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === "--file" || t === "--price-csv") {
      const next = tokens[i + 1]
      if (next && !next.startsWith("--")) {
        path = next.trim()
        i++
      }
      continue
    }
    const mFile = t.match(/^--file=(.*)$/)
    const mPrice = t.match(/^--price-csv=(.*)$/)
    if (mFile?.[1]) {
      path = mFile[1].trim()
      continue
    }
    if (mPrice?.[1]) {
      path = mPrice[1].trim()
      continue
    }
    rest.push(t)
  }
  return { rest, path }
}

const getApplyFlag = (scriptArgs: string[]) =>
  scriptArgs.includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.AS_COLOUR_PRICING_APPLY === "1" ||
  process.env.AS_COLOUR_PRICING_APPLY === "true"

/** `--from-gold-csv` / `--gold` are aliases. Supports `--from-gold-csv=/path` (equals form). */
const getFromGoldCostFlag = (scriptArgs: string[]) =>
  scriptArgs.includes("--from-gold-cost") ||
  scriptArgs.includes("--from-gold-csv") ||
  scriptArgs.includes("--gold") ||
  scriptArgs.some((a) => /^--from-gold-(?:cost|csv)=/.test(a)) ||
  process.argv.some((a) => /^--from-gold-(?:cost|csv)=/.test(a)) ||
  process.argv.includes("--from-gold-cost") ||
  process.argv.includes("--from-gold-csv") ||
  process.argv.includes("--gold") ||
  process.env.AS_COLOUR_FROM_GOLD_COST === "1" ||
  process.env.AS_COLOUR_FROM_GOLD_COST === "true"

/** No BASE_SALE_PRICE values but STYLECODE + PRICE → treat as gold cost sheet. */
const sheetLooksLikeGoldCostOnly = (rows: CsvRow[]): boolean => {
  if (!rows.length) {
    return false
  }
  const anyBase = rows.some((r) => parseMoneyToMinor(r["BASE_SALE_PRICE"]) !== null)
  if (anyBase) {
    return false
  }
  return rows.some((r) => {
    const sc = normalizeStyleCode(r["STYLECODE"])
    const p = parseMoneyToMinor(r["PRICE"])
    return Boolean(sc && p !== null && p > 0)
  })
}

/** STYLECODE + PRICE (supplier cost); tiers derived via tiersFromCostMinor (five bands). */
const buildStylePricingMapFromGold = (rows: CsvRow[]) => {
  const byLookupKey = new Map<string, StylePricing>()
  const duplicateLookupKeys = new Set<string>()

  for (const row of rows) {
    const styleCode = normalizeStyleCode(row["STYLECODE"])
    if (!styleCode) {
      continue
    }

    const costMinor = parseMoneyToMinor(row["PRICE"])
    if (costMinor === null || costMinor <= 0) {
      continue
    }

    const tiers: Tier[] = tiersFromCostMinor(costMinor).map((t) => ({
      min_quantity: t.min_quantity,
      ...(typeof t.max_quantity === "number" ? { max_quantity: t.max_quantity } : {}),
      amount: t.amount,
    }))

    const stylePricing: StylePricing = {
      styleCode,
      costPriceMinor: costMinor,
      tiers,
    }

    const band = parseExtendedSizeBandFromProductName(row["PRODUCT_NAME"])
    const lookupKey = stylePricingLookupKey(styleCode, band)

    if (byLookupKey.has(lookupKey)) {
      duplicateLookupKeys.add(lookupKey)
    }

    byLookupKey.set(lookupKey, stylePricing)
  }

  return {
    byLookupKey,
    duplicateLookupKeys: Array.from(duplicateLookupKeys),
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

const parseHandleSetFromAsColourImport = (rows: CsvRow[]) => {
  const handles = new Set<string>()

  for (const row of rows) {
    const handle = row["Product Handle"]?.trim().toLowerCase()
    if (!handle || !handle.startsWith("as-colour-")) {
      continue
    }
    handles.add(handle)
  }

  return Array.from(handles)
}

const resolveStylePricingForVariant = (
  variant: {
    sku?: string
    product_id?: string
    product?: { handle?: string }
    metadata?: Record<string, unknown>
  },
  productHandleById: Map<string, string>,
  byLookupKey: Map<string, StylePricing>
): StylePricing | undefined => {
  const metadataStyleCode = (variant.metadata as Record<string, unknown> | undefined)
    ?.as_colour_style_code as string | undefined
  const handle =
    variant.product?.handle ??
    (variant.product_id ? productHandleById.get(variant.product_id) : undefined)

  return resolveStylePricingForHandlesAndSku(handle, variant.sku, metadataStyleCode, byLookupKey)
}

export default async function updateAsColourPricing({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }
  const link = container.resolve(ContainerRegistrationKeys.LINK) as {
    create: (data: Record<string, unknown>) => Promise<unknown>
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

  const { rest: scriptArgs, path: priceCsvFromFlag } = extractExplicitPriceCsvPath(
    normalizeGoldCostArgv(mergeScriptArgv(args))
  )
  const apply = getApplyFlag(scriptArgs)
  const goldFlag = getFromGoldCostFlag(scriptArgs)
  const positionalArgs = [
    ...(priceCsvFromFlag ? [priceCsvFromFlag] : []),
    ...scriptArgs.filter((a) => !a.startsWith("--")),
  ]

  const priceCsvPath = resolveExistingPath(
    positionalArgs[0] ? [positionalArgs[0], ...DEFAULT_PRICE_CSV_CANDIDATES] : DEFAULT_PRICE_CSV_CANDIDATES,
    "AS Colour price CSV"
  )
  const importCsvPath = resolveExistingPath(DEFAULT_IMPORT_CSV_CANDIDATES, "AS Colour import CSV")

  const pricingRows = parseCsv(fs.readFileSync(priceCsvPath, "utf8"))
  const fromGoldCost = goldFlag || sheetLooksLikeGoldCostOnly(pricingRows)
  const importRows = parseCsv(fs.readFileSync(importCsvPath, "utf8"))

  logger.info(`Mode: ${apply ? "APPLY" : "DRY RUN"} (pass -- --apply to write changes)`)
  logger.info(
    `Pricing mode: ${
      !fromGoldCost
        ? "explicit BASE_SALE_PRICE / TIER_* columns (four tiers)"
        : goldFlag
          ? "gold (flag: STYLECODE + PRICE → five tiers)"
          : "gold (auto: no BASE_SALE_PRICE column values → five tiers from PRICE)"
    }`
  )
  logger.info(`Price CSV: ${priceCsvPath}`)
  logger.info(`Import CSV: ${importCsvPath}`)

  const { byLookupKey, duplicateLookupKeys } = fromGoldCost
    ? buildStylePricingMapFromGold(pricingRows)
    : buildExplicitStylePricingMapFromCsvRows(pricingRows)
  const asColourSkus = parseSkuSetFromAsColourImport(importRows)
  const asColourHandles = parseHandleSetFromAsColourImport(importRows)

  if (!byLookupKey.size) {
    throw new Error("No valid style pricing rows found in price CSV")
  }

  if (!asColourSkus.length) {
    throw new Error("No AS Colour SKUs found in import CSV")
  }
  if (!asColourHandles.length) {
    throw new Error("No AS Colour product handles found in import CSV")
  }

  if (duplicateLookupKeys.length) {
    logger.warn(
      `Duplicate pricing CSV keys found. Last row wins for: ${duplicateLookupKeys.join(", ")}`
    )
  }

  logger.info(
    `Loaded ${byLookupKey.size} style price rows, ${asColourSkus.length} AS Colour SKUs, and ${asColourHandles.length} AS Colour handles`
  )

  const { data: asColourProductsData } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: {
      handle: asColourHandles,
    },
  })
  const asColourProducts = (asColourProductsData ?? []) as Array<{ id: string; handle: string }>
  if (!asColourProducts.length) {
    throw new Error("No AS Colour products found in DB for handles from import CSV")
  }

  const asColourProductIds = asColourProducts.map((product) => product.id)
  const productHandleById = new Map(asColourProducts.map((product) => [product.id, product.handle]))
  const productIdBatches = chunk(asColourProductIds, BATCH_SIZE)
  const variantRows: Array<{
    id: string
    sku?: string
    product_id?: string
    product?: { handle?: string }
    metadata?: Record<string, unknown>
    price_set?: { id?: string }
  }> = []

  for (const productIdBatch of productIdBatches) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "product_id", "product.handle", "metadata", "price_set.id"],
      filters: {
        product_id: productIdBatch,
      },
    })

    for (const row of (data ?? []) as Array<{
      id: string
      sku?: string
      product_id?: string
      product?: { handle?: string }
      metadata?: Record<string, unknown>
      price_set?: { id?: string }
    }>) {
      variantRows.push(row)
    }
  }

  if (!variantRows.length) {
    throw new Error("No matching product variants found in database for AS Colour SKUs")
  }

  const foundSkuSet = new Set(
    variantRows
      .map((variant) => variant.sku)
      .filter((sku): sku is string => typeof sku === "string" && sku.length > 0)
  )
  const missingSkuCount = asColourSkus.filter((sku) => !foundSkuSet.has(sku)).length
  if (missingSkuCount) {
    logger.warn(`SKUs present in import CSV but not found in AS Colour product variants: ${missingSkuCount}`)
  }

  let matchedStyleCount = 0
  let updatedVariantCount = 0
  let noStyleMatchCount = 0
  let updatedWithoutPriceSetCount = 0

  for (const variant of variantRows) {
    const stylePricing = resolveStylePricingForVariant(variant, productHandleById, byLookupKey)
    if (!stylePricing) {
      noStyleMatchCount++
      continue
    }

    matchedStyleCount++

    const existingMetadata = (variant.metadata ?? {}) as Record<string, unknown>
    const nextMetadata: Record<string, unknown> = {
      ...existingMetadata,
      bulk_pricing: {
        source: path.basename(priceCsvPath),
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

    const priceSetId = variant.price_set?.id
    if (priceSetId) {
      await pricingModuleService.upsertPriceSets([
        {
          id: priceSetId,
          prices: pricesForPriceSet,
        },
      ])

      await productModuleService.updateProductVariants(variant.id, {
        metadata: nextMetadata,
      })
    } else {
      const createdPriceSets = (await pricingModuleService.upsertPriceSets([
        {
          prices: pricesForPriceSet,
        },
      ])) as Array<{ id?: string }>
      const createdPriceSetId = createdPriceSets[0]?.id
      if (!createdPriceSetId) {
        throw new Error(`Failed to create price set for variant ${variant.id}`)
      }

      await link.create({
        [Modules.PRODUCT]: {
          variant_id: variant.id,
        },
        [Modules.PRICING]: {
          price_set_id: createdPriceSetId,
        },
      })
      // Variants missing a price set can trigger an ORM bug when updating metadata in the same flow.
      // Link the new price set first to restore purchasability; metadata can be backfilled separately.
      updatedWithoutPriceSetCount++
    }
    updatedVariantCount++
  }

  logger.info(
    `Matched ${matchedStyleCount} variants to style pricing rows. Unmatched variants: ${noStyleMatchCount}.`
  )

  if (apply) {
    logger.info(
      `Updated ${updatedVariantCount} variant prices with quantity tiers and metadata (${updatedWithoutPriceSetCount} variants created/updated via direct prices fallback).`
    )
  } else {
    logger.info("Dry run complete. Re-run with -- --apply to persist price updates.")
  }
}
