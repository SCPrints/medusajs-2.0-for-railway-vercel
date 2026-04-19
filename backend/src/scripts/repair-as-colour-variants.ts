import fs from "node:fs"
import path from "node:path"

import { CreateProductVariantDTO, ExecArgs, UpdateProductVariantDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

type CsvRow = Record<string, string>

type ParsedVariant = {
  title: string
  sku?: string
  barcode?: string
  options: Record<string, string>
  prices: Array<{ amount: number; currency_code: string }>
  metadata: Record<string, unknown>
}

type ParsedProduct = {
  title: string
  subtitle?: string
  description?: string
  handle: string
  thumbnail?: string
  material?: string
  origin_country?: string
  hs_code?: string
  images: Array<{ url: string }>
  options: Array<{ title: string; values: string[] }>
  variants: ParsedVariant[]
}

const TARGET_HANDLES = [
  "as-colour-staple-tee-5001",
  "as-colour-classic-tee-5026",
  "as-colour-heavy-tee-5080",
  "as-colour-stencil-hood-5102",
]

function resolveAsColourCsvPath(): string {
  const fromEnv = process.env.AS_COLOUR_IMPORT_CSV?.trim()
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(fromEnv)
  }

  const candidates = [
    path.join(process.cwd(), "data", "as_colour_medusa_import.csv"),
    path.resolve(process.cwd(), "../as_colour_medusa_import.csv"),
    "/as_colour_medusa_import.csv",
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  throw new Error(
    `CSV not found. Set AS_COLOUR_IMPORT_CSV to a readable path, or place as_colour_medusa_import.csv in backend/data/ or the repo root. Tried: ${candidates.join(", ")}`
  )
}

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

const toNullableInt = (value?: string) => {
  if (!value) {
    return undefined
  }
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

const getVariantColor = (row: CsvRow) => {
  for (let optionIdx = 1; optionIdx <= 3; optionIdx++) {
    const optionName = row[`Variant Option ${optionIdx} Name`]
    const optionValue = row[`Variant Option ${optionIdx} Value`]

    if (!optionName || !optionValue) {
      continue
    }

    if (/colou?r/i.test(optionName)) {
      return optionValue
    }
  }

  return undefined
}

const parseProductsFromCsv = (rows: CsvRow[]) => {
  const grouped = new Map<string, CsvRow[]>()

  for (const row of rows) {
    const handle = row["Product Handle"]
    if (!handle || !TARGET_HANDLES.includes(handle)) {
      continue
    }

    const existing = grouped.get(handle) ?? []
    existing.push(row)
    grouped.set(handle, existing)
  }

  const parsedProducts = new Map<string, ParsedProduct>()

  for (const handle of TARGET_HANDLES) {
    const productRows = grouped.get(handle) ?? []
    if (!productRows.length) {
      continue
    }

    const first = productRows[0]
    const imageSet = new Set<string>()
    const optionValuesMap = new Map<string, Set<string>>()

    for (const row of productRows) {
      const thumbnail = row["Product Thumbnail"]
      const image1 = row["Product Image 1"]
      const image2 = row["Product Image 2"]
      if (thumbnail) imageSet.add(thumbnail)
      if (image1) imageSet.add(image1)
      if (image2) imageSet.add(image2)

      for (let optionIdx = 1; optionIdx <= 3; optionIdx++) {
        const optionName = row[`Variant Option ${optionIdx} Name`]
        const optionValue = row[`Variant Option ${optionIdx} Value`]
        if (!optionName || !optionValue) {
          continue
        }
        const currentValues = optionValuesMap.get(optionName) ?? new Set<string>()
        currentValues.add(optionValue)
        optionValuesMap.set(optionName, currentValues)
      }
    }

    const variants: ParsedVariant[] = productRows.map((row, index) => {
      const variantOptions: Record<string, string> = {}
      for (let optionIdx = 1; optionIdx <= 3; optionIdx++) {
        const optionName = row[`Variant Option ${optionIdx} Name`]
        const optionValue = row[`Variant Option ${optionIdx} Value`]
        if (optionName && optionValue) {
          variantOptions[optionName] = optionValue
        }
      }

      const amount = toNullableInt(row["Variant Price AUD"]) ?? 0
      const frontImage = row["Product Image 1"] || row["Product Thumbnail"] || undefined
      const backImage = row["Product Image 2"] || undefined

      return {
        title: row["Variant Title"] || `Variant ${index + 1}`,
        sku: row["Variant Sku"] || undefined,
        barcode: row["Variant Barcode"] || undefined,
        options: variantOptions,
        prices: [{ amount, currency_code: PRICE_CURRENCY_CODE }],
        metadata: {
          garment_color: getVariantColor(row),
          garment_images: {
            front: frontImage,
            back: backImage,
            all: [frontImage, backImage].filter(Boolean),
          },
        },
      }
    })

    parsedProducts.set(handle, {
      title: first["Product Title"],
      subtitle: first["Product Subtitle"] || undefined,
      description: first["Product Description"] || undefined,
      handle,
      thumbnail: first["Product Thumbnail"] || undefined,
      material: first["Product Material"] || undefined,
      origin_country: first["Product Origin Country"] || undefined,
      hs_code: first["Product Hs Code"] || undefined,
      images: Array.from(imageSet).map((url) => ({ url })),
      options: Array.from(optionValuesMap.entries()).map(([title, values]) => ({
        title,
        values: Array.from(values),
      })),
      variants,
    })
  }

  return parsedProducts
}

export default async function repairAsColourVariants({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL) as {
    listSalesChannels: (filters?: Record<string, unknown>) => Promise<Array<{ id: string }>>
  }
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT) as {
    listShippingProfiles: (filters?: Record<string, unknown>) => Promise<Array<{ id: string }>>
  }
  const productModuleService = container.resolve(Modules.PRODUCT) as unknown as {
    createProductVariants?: (data: CreateProductVariantDTO) => Promise<unknown>
    updateProductVariants?: (id: string, data: UpdateProductVariantDTO) => Promise<unknown>
  }

  if (
    typeof productModuleService.createProductVariants !== "function" ||
    typeof productModuleService.updateProductVariants !== "function"
  ) {
    throw new Error("Product module methods createProductVariants/updateProductVariants are unavailable")
  }

  const apply =
    args.includes("--apply") ||
    process.argv.includes("--apply") ||
    process.env.REPAIR_AS_COLOUR_APPLY === "1" ||
    process.env.REPAIR_AS_COLOUR_APPLY === "true"

  const csvPath = resolveAsColourCsvPath()

  logger.info(`Mode: ${apply ? "APPLY" : "DRY RUN"} (pass --apply to execute writes)`)
  logger.info(`Reading CSV from ${csvPath}`)

  const parsedProducts = parseProductsFromCsv(parseCsv(fs.readFileSync(csvPath, "utf8")))
  if (!parsedProducts.size) {
    throw new Error("No target products found in CSV")
  }

  const salesChannels = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannels.length) {
    throw new Error("Default Sales Channel not found")
  }
  const defaultSalesChannelId = salesChannels[0].id

  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({ type: "default" })
  if (!shippingProfiles.length) {
    throw new Error("Default shipping profile not found")
  }
  const shippingProfileId = shippingProfiles[0].id

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: {
      handle: TARGET_HANDLES,
    },
  })
  const productByHandle = new Map(
    (existingProducts ?? []).map((product: any) => [product.handle as string, product])
  )

  const productsToCreate: any[] = []

  for (const handle of TARGET_HANDLES) {
    if (productByHandle.has(handle)) {
      continue
    }

    const parsed = parsedProducts.get(handle)
    if (!parsed) {
      continue
    }

    productsToCreate.push({
      ...parsed,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
    })
  }

  if (productsToCreate.length) {
    logger.info(`Missing products to create: ${productsToCreate.length}`)
    for (const p of productsToCreate) {
      logger.info(` - ${p.handle} (${p.variants.length} variants)`)
    }

    if (apply) {
      await createProductsWorkflow(container).run({
        input: { products: productsToCreate },
      })
      logger.info("Created missing products.")
    }
  }

  // Refresh product IDs after potential creation.
  const { data: allTargetProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: {
      handle: TARGET_HANDLES,
    },
  })
  const targetProductByHandle = new Map(
    (allTargetProducts ?? []).map((product: any) => [product.handle as string, product])
  )

  for (const handle of TARGET_HANDLES) {
    const parsed = parsedProducts.get(handle)
    const targetProduct = targetProductByHandle.get(handle) as { id: string; handle: string } | undefined

    if (!parsed || !targetProduct) {
      logger.warn(`Skipping ${handle}: missing source or target product`)
      continue
    }

    const { data: existingVariants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "metadata"],
      filters: {
        product_id: [targetProduct.id],
      },
    })

    const existingBySku = new Map(
      (existingVariants ?? [])
        .filter((v: any) => typeof v.sku === "string" && v.sku.length)
        .map((v: any) => [v.sku as string, v])
    )

    const missingVariants = parsed.variants.filter((variant) => variant.sku && !existingBySku.has(variant.sku))
    const existingVariantUpdates = parsed.variants
      .filter((variant) => variant.sku && existingBySku.has(variant.sku))
      .map((variant) => {
        const existing = existingBySku.get(variant.sku!) as any
        return {
          id: existing.id,
          metadata: {
            ...((existing.metadata ?? {}) as Record<string, unknown>),
            ...variant.metadata,
          },
        }
      })

    logger.info(
      `${handle}: source variants=${parsed.variants.length}, existing variants=${existingVariants?.length ?? 0}, missing=${missingVariants.length}, metadata_updates=${existingVariantUpdates.length}`
    )

    if (!apply) {
      continue
    }

    for (const variant of missingVariants) {
      await productModuleService.createProductVariants({
        product_id: targetProduct.id,
        title: variant.title,
        sku: variant.sku,
        barcode: variant.barcode,
        options: variant.options,
        metadata: variant.metadata,
      })
    }

    for (const update of existingVariantUpdates) {
      await productModuleService.updateProductVariants(update.id, {
        metadata: update.metadata,
      })
    }
  }

  logger.info(`Repair script complete (${apply ? "APPLY" : "DRY RUN"}).`)
}
