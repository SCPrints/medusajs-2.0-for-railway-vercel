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

type ExtendedSizeBand = "4XL" | "5XL"

const PRICING_CSV_SOURCE_LABEL = "as_colour_final_website_pricing.csv"

const DEFAULT_PRICE_CSV_CANDIDATES = [
  process.env.AS_COLOUR_PRICE_CSV?.trim() || "",
  path.resolve(process.cwd(), "data", PRICING_CSV_SOURCE_LABEL),
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

const parseExtendedSizeBandFromProductName = (productName?: string): ExtendedSizeBand | null => {
  if (!productName) {
    return null
  }
  const match = productName.match(/\((4XL|5XL)\)/i)
  if (!match?.[1]) {
    return null
  }
  const band = match[1].toUpperCase()
  return band === "4XL" || band === "5XL" ? band : null
}

const extractExtendedSizeBandFromSku = (sku?: string): ExtendedSizeBand | null => {
  if (!sku) {
    return null
  }
  const match = sku.trim().toUpperCase().match(/-(4XL|5XL)$/)
  if (!match?.[1]) {
    return null
  }
  const band = match[1].toUpperCase()
  return band === "4XL" || band === "5XL" ? band : null
}

const stylePricingLookupKey = (styleCode: string, band: ExtendedSizeBand | null) =>
  band ? `${styleCode}:${band}` : styleCode

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
  const byLookupKey = new Map<string, StylePricing>()
  const duplicateLookupKeys = new Set<string>()

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

const extractStyleCodeFromHandle = (handle?: string) => {
  if (!handle) {
    return ""
  }

  const normalized = handle.trim().toUpperCase()
  const parts = normalized.split("-").filter(Boolean)
  const tail = parts[parts.length - 1] ?? ""
  return tail.replace(/[^A-Z0-9]/g, "")
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
  const asColourHandles = parseHandleSetFromAsColourImport(importRows)

  if (!byStyleCode.size) {
    throw new Error("No valid style pricing rows found in price CSV")
  }

  if (!asColourSkus.length) {
    throw new Error("No AS Colour SKUs found in import CSV")
  }
  if (!asColourHandles.length) {
    throw new Error("No AS Colour product handles found in import CSV")
  }

  if (duplicateStyleCodes.length) {
    logger.warn(
      `Duplicate STYLECODE values found in pricing CSV. Last row wins for: ${duplicateStyleCodes.join(", ")}`
    )
  }

  logger.info(
    `Loaded ${byStyleCode.size} style price rows, ${asColourSkus.length} AS Colour SKUs, and ${asColourHandles.length} AS Colour handles`
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
    const metadataStyleCode = normalizeStyleCode(
      (variant.metadata as Record<string, unknown> | undefined)?.as_colour_style_code as string | undefined
    )
    const handleStyleCode = normalizeStyleCode(
      extractStyleCodeFromHandle(
        variant.product?.handle ??
          (variant.product_id ? productHandleById.get(variant.product_id) : undefined)
      )
    )
    const styleCandidates = [
      metadataStyleCode,
      ...extractStyleCodeCandidatesFromSku(variant.sku),
      handleStyleCode,
    ].filter(Boolean)

    const resolvedStyleCode = styleCandidates.find((candidate) => byStyleCode.has(candidate))
    const stylePricing = resolvedStyleCode ? byStyleCode.get(resolvedStyleCode) : undefined
    if (!stylePricing) {
      noStyleMatchCount++
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
