import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { parseMoneyToMinor } from "../utils/parse-money-to-minor"
import { withNonTrackedInventoryDefaults } from "./utils/variant-inventory-defaults"

type CsvRow = Record<string, string>
type VariantGarmentImages = {
  front?: string
  back?: string
  all?: string[]
}

const TARGET_HANDLES = [
  "as-colour-staple-tee-5001",
  "as-colour-stencil-hood-5102",
  "as-colour-heavy-tee-5080",
  "as-colour-classic-tee-5026",
]

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

export default async function importSelectedAsColourProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL) as {
    listSalesChannels: (filters?: Record<string, unknown>) => Promise<Array<{ id: string }>>
  }
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT) as {
    listShippingProfiles: (filters?: Record<string, unknown>) => Promise<Array<{ id: string }>>
  }

  const csvPath = path.resolve(process.cwd(), "../as_colour_medusa_import.csv")
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`)
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

  const rawCsv = fs.readFileSync(csvPath, "utf-8")
  const rows = parseCsv(rawCsv).filter((row) => TARGET_HANDLES.includes(row["Product Handle"]))

  if (!rows.length) {
    throw new Error("No matching rows found in CSV for target handles")
  }

  const grouped = new Map<string, CsvRow[]>()
  for (const row of rows) {
    const handle = row["Product Handle"]
    const existingRows = grouped.get(handle) ?? []
    existingRows.push(row)
    grouped.set(handle, existingRows)
  }

  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: {
      handle: TARGET_HANDLES,
    },
  })
  const existingHandles = new Set((existingProducts ?? []).map((p: any) => p.handle))

  const productsToCreate: any[] = []

  for (const handle of TARGET_HANDLES) {
    if (existingHandles.has(handle)) {
      logger.info(`Skipping existing product: ${handle}`)
      continue
    }

    const productRows = grouped.get(handle) ?? []
    if (!productRows.length) {
      logger.warn(`No CSV rows found for ${handle}`)
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

    const options = Array.from(optionValuesMap.entries()).map(([title, values]) => ({
      title,
      values: Array.from(values),
    }))

    const variants = productRows.map((row, index) => {
      const variantOptions: Record<string, string> = {}

      for (let optionIdx = 1; optionIdx <= 3; optionIdx++) {
        const optionName = row[`Variant Option ${optionIdx} Name`]
        const optionValue = row[`Variant Option ${optionIdx} Value`]
        if (optionName && optionValue) {
          variantOptions[optionName] = optionValue
        }
      }

      const amount = parseMoneyToMinor(row["Variant Price AUD"]) ?? 0
      const frontImage = row["Product Image 1"] || row["Product Thumbnail"] || undefined
      const backImage = row["Product Image 2"] || undefined
      const garmentImages: VariantGarmentImages = {
        front: frontImage,
        back: backImage,
        all: [frontImage, backImage].filter(Boolean) as string[],
      }
      const variantColor = getVariantColor(row)

      return {
        title: row["Variant Title"] || `Variant ${index + 1}`,
        sku: row["Variant Sku"] || undefined,
        barcode: row["Variant Barcode"] || undefined,
        metadata: {
          garment_color: variantColor,
          garment_images: garmentImages,
        },
        options: variantOptions,
        prices: [
          {
            amount,
            currency_code: PRICE_CURRENCY_CODE,
          },
        ],
        ...withNonTrackedInventoryDefaults({}),
      }
    })

    productsToCreate.push({
      title: first["Product Title"],
      subtitle: first["Product Subtitle"] || undefined,
      description: first["Product Description"] || undefined,
      handle,
      status: ProductStatus.PUBLISHED,
      thumbnail: first["Product Thumbnail"] || undefined,
      weight: toNullableInt(first["Product Weight"]),
      material: first["Product Material"] || undefined,
      origin_country: first["Product Origin Country"] || undefined,
      hs_code: first["Product Hs Code"] || undefined,
      images: Array.from(imageSet).map((url) => ({ url })),
      options,
      variants,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
    })
  }

  if (!productsToCreate.length) {
    logger.info("No products to create. All requested products already exist.")
    return
  }

  logger.info(`Creating ${productsToCreate.length} selected products...`)

  await createProductsWorkflow(container).run({
    input: {
      products: productsToCreate,
    },
  })

  logger.info(`Import complete. Created handles: ${productsToCreate.map((p) => p.handle).join(", ")}`)
}
