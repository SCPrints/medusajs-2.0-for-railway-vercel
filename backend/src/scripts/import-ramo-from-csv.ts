/**
 * Import Ramo Australia catalog from a raw Ramo CSV into Medusa
 * (handles `ramo-*`). One Medusa product per `parent_code`, one variant
 * per `product_id`. Brand + taxonomy + shop categories all attach via
 * the shared supplier-import-pipeline.
 *
 * Pricing: treats `price_ex_gst` as the supplier ex-GST cost, then
 * marks up the same way DNC does — t100 = round(cost * 1.1 * 1.5) in
 * minor units, lower bands derived via RAMO_DERIVE_* env knobs.
 *
 * Usage (from `backend/`):
 *   pnpm run import-ramo-from-csv
 *   pnpm run import-ramo-from-csv -- --apply
 *
 * Env:
 *   RAMO_IMPORT_CSV — path to raw Ramo CSV (single file)
 *   RAMO_IMPORT_CSVS — comma-separated multiple paths (precedence over RAMO_IMPORT_CSV)
 *   RAMO_MAX_PRODUCTS — cap product count (testing)
 *   RAMO_PRODUCT_BATCH — createProductsWorkflow batch size (default 25)
 *   RAMO_IMPORT_STATUS — "published" | "draft" (default "draft" — Ramo prices need vetting)
 *   RAMO_DERIVE_T50, RAMO_DERIVE_T10_FROM_T50, RAMO_DERIVE_BASE_FROM_T10 — tier markup multipliers
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

import { BRAND_MODULE } from "../modules/brand"
import { classifyRamoProduct } from "../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
} from "../lib/supplier-import-pipeline"
import { parseMoneyToMinor } from "../utils/parse-money-to-minor"
import { withNonTrackedInventoryDefaults } from "./utils/variant-inventory-defaults"
import { extractFabricFromRamoHtml } from "./backfill-material-from-description"

type CsvRow = Record<string, string>

const PRICE_CURRENCY_CODE = "aud"
const BULK_PRICING_SOURCE = "ramo-csv"

const RAMO_BRAND_NAME = "Ramo"
const RAMO_BRAND_HANDLE = "ramo"
const RAMO_BRAND_EXTERNAL_CODE = "RAMO"

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

type TierMoneyMinor = {
  base: number
  t10: number
  t50: number
  t100: number
}

const deriveTiersFromT100Minor = (t100M: number, m: ReturnType<typeof getDeriveMultipliers>): TierMoneyMinor => {
  const t50M = Math.round(t100M * m.t50OverT100)
  const t10M = Math.round(t50M * m.t10OverT50)
  const baseM = Math.round(t10M * m.baseOverT10)
  return { base: baseM, t10: t10M, t50: t50M, t100: t100M }
}

const minorToMajor = (minor: number): number => minor / 100

const buildPricesForPriceSet = (m: TierMoneyMinor): Array<Record<string, unknown>> => [
  { amount: minorToMajor(m.base), currency_code: PRICE_CURRENCY_CODE, min_quantity: 1, max_quantity: 9 },
  { amount: minorToMajor(m.t10), currency_code: PRICE_CURRENCY_CODE, min_quantity: 10, max_quantity: 49 },
  { amount: minorToMajor(m.t50), currency_code: PRICE_CURRENCY_CODE, min_quantity: 50, max_quantity: 99 },
  { amount: minorToMajor(m.t100), currency_code: PRICE_CURRENCY_CODE, min_quantity: 100 },
]

const buildTierMetadata = (tiers: TierMoneyMinor) => ({
  source: BULK_PRICING_SOURCE,
  currency_code: PRICE_CURRENCY_CODE,
  tiers: [
    { min_quantity: 1, max_quantity: 9, amount: minorToMajor(tiers.base) },
    { min_quantity: 10, max_quantity: 49, amount: minorToMajor(tiers.t10) },
    { min_quantity: 50, max_quantity: 99, amount: minorToMajor(tiers.t50) },
    { min_quantity: 100, amount: minorToMajor(tiers.t100) },
  ],
})

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

const RAMO_DEFAULT_CSV_FILENAMES = [
  "ramo-catalog.csv",
  "ramo.csv",
] as const

const resolveCsvPaths = (cwd: string): string[] => {
  const fromList = (process.env.RAMO_IMPORT_CSVS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p))
  if (fromList.length) {
    for (const p of fromList) {
      if (!fs.existsSync(p)) {
        throw new Error(`RAMO_IMPORT_CSVS path not found: ${p}`)
      }
    }
    return fromList
  }
  const single = (process.env.RAMO_IMPORT_CSV || "").trim()
  if (single) {
    const resolved = path.resolve(single)
    if (!fs.existsSync(resolved)) {
      throw new Error(`RAMO_IMPORT_CSV not found: ${resolved}`)
    }
    return [resolved]
  }
  const candidates: string[] = []
  for (const name of RAMO_DEFAULT_CSV_FILENAMES) {
    candidates.push(path.resolve(cwd, "data", name))
    candidates.push(path.resolve(cwd, "backend", "data", name))
  }
  const found = candidates.filter((p) => fs.existsSync(p))
  if (found.length) {
    return found
  }
  throw new Error(
    `Ramo CSV not found. Set RAMO_IMPORT_CSV / RAMO_IMPORT_CSVS or place one of: ${RAMO_DEFAULT_CSV_FILENAMES.join(
      ", "
    )} under data/. Tried: ${candidates.join(", ")}`
  )
}

const slugifyHandle = (code: string) =>
  code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "product"

const parseIntEnv = (key: string, fallback: number) => {
  const n = Number.parseInt(process.env[key] || "", 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const chunk = <T>(items: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

const getApplyFlag = (args: string[] | undefined) =>
  (args ?? []).includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.RAMO_IMPORT_APPLY === "1" ||
  process.env.RAMO_IMPORT_APPLY === "true"

const getImportStatus = (): ProductStatus => {
  const raw = (process.env.RAMO_IMPORT_STATUS ?? "draft").trim().toLowerCase()
  return raw === "published" ? ProductStatus.PUBLISHED : ProductStatus.DRAFT
}

export default async function importRamoFromCsv({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apply = getApplyFlag(args)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: Record<string, unknown>) => Promise<{ data?: unknown[] }>
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
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL) as {
    listSalesChannels: (filters?: Record<string, unknown>) => Promise<Array<{ id: string }>>
  }
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT) as {
    listShippingProfiles: (filters?: Record<string, unknown>) => Promise<Array<{ id: string }>>
  }
  const brandService = container.resolve(BRAND_MODULE) as {
    listBrands: (filters?: Record<string, unknown>) => Promise<Array<{ id: string; name?: string; handle?: string; external_code?: string | null }>>
    createBrands: (data: Array<Record<string, unknown>>) => Promise<Array<{ id: string; name?: string }>>
  }

  const csvPaths = resolveCsvPaths(process.cwd())
  const deriveMult = getDeriveMultipliers()
  const maxProducts = parseIntEnv("RAMO_MAX_PRODUCTS", Number.POSITIVE_INFINITY)
  const productBatchSize = parseIntEnv("RAMO_PRODUCT_BATCH", 25)
  const importStatus = getImportStatus()

  logger.info(`Ramo import mode: ${apply ? "APPLY" : "DRY RUN"} (use -- --apply to write)`)
  logger.info(`CSV(s): ${csvPaths.map((p) => path.basename(p)).join(", ")}`)
  logger.info(`Status for new products: ${importStatus}`)

  const allRows: CsvRow[] = []
  for (const p of csvPaths) {
    const raw = fs.readFileSync(p, "utf-8")
    allRows.push(...parseCsv(raw))
  }
  logger.info(`Loaded ${allRows.length} CSV row(s).`)

  const salesChannels = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannels.length) {
    throw new Error("Default Sales Channel not found")
  }
  const defaultSalesChannelId = salesChannels[0]!.id
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({ type: "default" })
  if (!shippingProfiles.length) {
    throw new Error("Default shipping profile not found")
  }
  const shippingProfileId = shippingProfiles[0]!.id

  // Resolve (or auto-create) the Ramo Brand entity. Ramo isn't in any
  // audience-routing brand set (general-apparel mix) so per-product
  // audience routing flows through title/tag inference in the pipeline.
  const existingBrands = await brandService.listBrands({})
  let ramoBrand = existingBrands.find(
    (b) =>
      (b.external_code ?? "").toUpperCase() === RAMO_BRAND_EXTERNAL_CODE ||
      (b.handle ?? "").toLowerCase() === RAMO_BRAND_HANDLE ||
      (b.name ?? "").toLowerCase() === RAMO_BRAND_NAME.toLowerCase()
  )
  if (!ramoBrand && apply) {
    const [created] = await brandService.createBrands([
      {
        name: RAMO_BRAND_NAME,
        handle: RAMO_BRAND_HANDLE,
        external_code: RAMO_BRAND_EXTERNAL_CODE,
        is_active: true,
      },
    ])
    ramoBrand = created
    logger.info(`Created brand "${RAMO_BRAND_NAME}" (${ramoBrand!.id}).`)
  } else if (!ramoBrand) {
    logger.info(
      `[dry] Would create brand "${RAMO_BRAND_NAME}" (handle ${RAMO_BRAND_HANDLE}, external_code ${RAMO_BRAND_EXTERNAL_CODE}).`
    )
  } else {
    logger.info(`Reusing existing brand "${ramoBrand.name ?? RAMO_BRAND_NAME}" (${ramoBrand.id}).`)
  }

  // Group by parent_code (one Medusa product per parent_code, variants per product_id).
  const byParent = new Map<string, CsvRow[]>()
  for (const row of allRows) {
    const pc = (row["parent_code"] ?? "").trim().toUpperCase()
    if (!pc) {
      continue
    }
    const list = byParent.get(pc)
    if (list) {
      list.push(row)
    } else {
      byParent.set(pc, [row])
    }
  }

  type Prepared = {
    handle: string
    productPayload: Record<string, unknown>
    skus: string[]
    sourceRow: CsvRow
  }
  const prepared: Prepared[] = []

  for (const groupRows of byParent.values()) {
    if (prepared.length >= maxProducts) {
      break
    }
    const first = groupRows[0]!
    const parentCode = (first["parent_code"] ?? "").trim().toUpperCase()
    const handle = `ramo-${slugifyHandle(parentCode)}`
    const productTitle = (first["name"] ?? "").trim() || `Ramo ${parentCode}`
    const description = (first["long_description"] ?? "").trim()
    const heroImage =
      (first["product_image_hero_url"] ?? "").trim() ||
      (first["product_image_url"] ?? "").trim()

    const seenSku = new Set<string>()
    const colourValues = new Set<string>()
    const sizeValues = new Set<string>()
    type VariantRow = {
      sku: string
      colour: string
      size: string
      priceMinor: number
      variantImage: string
    }
    const variantRows: VariantRow[] = []

    for (const row of groupRows) {
      const sku = (row["product_id"] ?? "").trim()
      if (!sku || seenSku.has(sku)) {
        continue
      }
      const priceMinor = parseMoneyToMinor(row["price_ex_gst"] || "")
      if (priceMinor === null) {
        continue
      }
      seenSku.add(sku)
      const colour = (row["attribute_colours"] ?? "").trim() || "Default"
      const size = (row["attribute_size"] ?? "").trim() || "One Size"
      colourValues.add(colour)
      sizeValues.add(size)
      variantRows.push({
        sku,
        colour,
        size,
        priceMinor,
        variantImage: (row["product_image_url"] ?? "").trim(),
      })
    }

    if (!variantRows.length) {
      continue
    }

    const useColour = colourValues.size > 1 || (colourValues.size === 1 && !colourValues.has("Default"))
    const useSize = sizeValues.size > 1 || (sizeValues.size === 1 && !sizeValues.has("One Size"))

    const options: Array<{ title: string; values: string[] }> = []
    if (useColour) options.push({ title: "Colour", values: Array.from(colourValues) })
    if (useSize) options.push({ title: "Size", values: Array.from(sizeValues) })
    if (!options.length) options.push({ title: "Type", values: ["Default"] })

    const medusaVariants: Array<Record<string, unknown>> = variantRows.map((v) => {
      const t100Minor = Math.round(v.priceMinor * 1.1 * 1.5)
      const tiers = deriveTiersFromT100Minor(t100Minor, deriveMult)
      const optionsMap: Record<string, string> = {}
      if (useColour) optionsMap["Colour"] = v.colour
      if (useSize) optionsMap["Size"] = v.size
      if (!useColour && !useSize) optionsMap["Type"] = "Default"
      const variantTitle = [v.colour, v.size].filter((x) => x && x !== "Default" && x !== "One Size").join(" / ") || v.sku
      return {
        title: variantTitle,
        sku: v.sku,
        options: optionsMap,
        prices: [{ amount: minorToMajor(tiers.base), currency_code: PRICE_CURRENCY_CODE }],
        metadata: {
          ramo_product_id: v.sku,
          ramo_cost_price_ex_gst_minor: v.priceMinor,
          // Canonical ex-GST cost in minor units — read by the tier-pricing
          // regen job. See `backend/src/lib/customer-tiers.ts`.
          cost_price_ex_gst_minor: v.priceMinor,
          bulk_pricing: buildTierMetadata(tiers),
        },
        ...withNonTrackedInventoryDefaults({}),
      }
    })

    const imgs = new Set<string>()
    if (heroImage) imgs.add(heroImage)
    for (const v of variantRows) {
      if (v.variantImage) imgs.add(v.variantImage)
    }

    const material = extractFabricFromRamoHtml(description)

    prepared.push({
      handle,
      skus: medusaVariants.map((x) => (x.sku as string) || "").filter(Boolean),
      sourceRow: first,
      productPayload: {
        title: productTitle,
        description: description || undefined,
        material: material ?? undefined,
        handle,
        status: importStatus,
        thumbnail: heroImage || undefined,
        images: Array.from(imgs).map((url) => ({ url })),
        options,
        variants: medusaVariants,
        shipping_profile_id: shippingProfileId,
        sales_channels: [{ id: defaultSalesChannelId }],
      },
    })
  }

  logger.info(
    `Prepared products: ${prepared.length} (max cap: ${maxProducts === Number.POSITIVE_INFINITY ? "none" : maxProducts})`
  )

  if (!prepared.length) {
    logger.info("Nothing to import.")
    return
  }

  // Idempotency: skip handles already in the DB.
  const handles = prepared.map((p) => p.handle)
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: handles },
  })
  const existingHandles = new Set(
    (existing ?? []).map((e: { handle?: string }) => (e as { handle: string }).handle)
  )
  const toCreate = prepared.filter((p) => !existingHandles.has(p.handle))
  const skipped = prepared.length - toCreate.length
  if (skipped) {
    logger.info(`Skipping ${skipped} product(s) that already exist (by handle).`)
  }
  if (!toCreate.length) {
    logger.info("All prepared handles already exist. Nothing to create.")
    return
  }

  if (!apply) {
    for (const p of toCreate.slice(0, 10)) {
      logger.info(
        ` [dry] ${p.handle} — ${(p.productPayload.variants as unknown[]).length} variants, sample SKUs: ${p.skus.slice(0, 3).join(", ")}`
      )
    }
    if (toCreate.length > 10) {
      logger.info(` [dry] ... and ${toCreate.length - 10} more products`)
    }
    logger.info("Dry run complete. Re-run with -- --apply to create products and apply pipeline.")
    return
  }

  const createdForPipeline: Array<{ id: string; handle: string; title?: string }> = []
  const sourceByHandle = new Map<string, CsvRow>(
    toCreate.map((p) => [p.handle, p.sourceRow])
  )

  for (const batch of chunk(toCreate, productBatchSize)) {
    const products = batch.map((b) => b.productPayload) as any[]
    await createProductsWorkflow(container).run({ input: { products } })
    const batchHandles = batch.map((b) => b.handle)
    const { data: createdProducts } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "title"],
      filters: { handle: batchHandles },
    })
    for (const pr of (createdProducts ?? []) as Array<{ id: string; handle: string; title?: string | null }>) {
      createdForPipeline.push({ id: pr.id, handle: pr.handle, title: pr.title ?? undefined })
    }
    const idByHandle = new Map(
      (createdProducts ?? []).map((pr: { id: string; handle: string }) => [pr.handle, pr.id])
    )

    for (const item of batch) {
      const pid = idByHandle.get(item.handle)
      if (!pid) {
        logger.warn(`Created batch: could not resolve product id for ${item.handle}`)
        continue
      }
      const { data: vars } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "price_set.id", "metadata"],
        filters: { product_id: [pid] },
      })
      const bySku = new Map(
        (vars ?? []).map((v: { id: string; sku?: string; price_set?: { id?: string }; metadata?: unknown }) => [
          (v.sku || "").trim(),
          v,
        ])
      )

      for (const sku of item.skus) {
        const vrow = bySku.get(sku)
        if (!vrow) {
          logger.warn(`Variant not found for SKU ${sku} on ${item.handle}`)
          continue
        }
        const costMinor = (vrow.metadata as Record<string, unknown> | undefined)?.ramo_cost_price_ex_gst_minor
        if (typeof costMinor !== "number" || !Number.isFinite(costMinor)) {
          continue
        }
        const t100Minor = Math.round(costMinor * 1.1 * 1.5)
        const tiers = deriveTiersFromT100Minor(t100Minor, deriveMult)
        const pricesForPriceSet = buildPricesForPriceSet(tiers)
        const existingMeta = (vrow.metadata ?? {}) as Record<string, unknown>
        const nextMetadata: Record<string, unknown> = {
          ...existingMeta,
          bulk_pricing: buildTierMetadata(tiers),
          ramo_cost_price_ex_gst_minor: costMinor,
          cost_price_ex_gst_minor: costMinor,
        }

        const priceSetId = vrow.price_set?.id
        if (priceSetId) {
          await pricingModuleService.upsertPriceSets([{ id: priceSetId, prices: pricesForPriceSet }])
        } else {
          const createdPriceSets = (await pricingModuleService.upsertPriceSets([
            { prices: pricesForPriceSet },
          ])) as Array<{ id?: string }>
          const newId = createdPriceSets[0]?.id
          if (!newId) {
            throw new Error(`Failed to create price set for variant ${vrow.id}`)
          }
          await link.create({
            [Modules.PRODUCT]: { variant_id: vrow.id },
            [Modules.PRICING]: { price_set_id: newId },
          })
        }
        await productModuleService.updateProductVariants(vrow.id, { metadata: nextMetadata })
      }
    }
    logger.info(`Created batch: ${batch.map((b) => b.handle).join(", ")}`)
  }

  // Post-create taxonomy pipeline (CLAUDE.md "Types & tags convention").
  if (createdForPipeline.length) {
    if (ramoBrand) {
      await linkProductsToBrand(container, createdForPipeline, ramoBrand.id)
    } else {
      logger.warn("Ramo brand was not resolved; skipping Product↔Brand link step.")
    }
    await applyTaxonomyToProducts(container, {
      products: createdForPipeline,
      sourceByHandle,
      classify: classifyRamoProduct,
      logger,
      // Ramo's catalog is unisex unless explicitly gendered (mirrors
      // AS Colour). Hands this hint to applyTitleFallbacks so apparel
      // without a gender field gets tagged Unisex when title inference
      // and primary_category-based demographic both miss.
      brandHandle: "ramo",
    })
    await applyShopCategoriesToProducts(container, createdForPipeline, logger)
  }

  logger.info(
    `Import finished. Created ${toCreate.length} product(s). Post-import: revalidate storefront cache; reindex Meilisearch if used.`
  )
  if (importStatus === ProductStatus.DRAFT) {
    logger.info(
      "Products imported as DRAFT — vet retail prices, then bulk-publish via admin or the update flow. Re-run /admin/taxonomy-audit/backfill after publishing if storefront category coverage looks off."
    )
  }
}
