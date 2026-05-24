import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { UpdateProductVariantDTO } from "@medusajs/framework/types"

type CsvRow = Record<string, string>

type VariantImageData = {
  sku: string
  color?: string
  front?: string
  back?: string
}

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

const chunk = <T,>(input: T[], size: number) => {
  const out: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    out.push(input.slice(i, i + size))
  }
  return out
}

export default async function backfillVariantGarmentImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModuleService = container.resolve(Modules.PRODUCT) as unknown as {
    updateProductVariants?: (
      id: string,
      data: UpdateProductVariantDTO
    ) => Promise<unknown>
  }

  if (typeof productModuleService.updateProductVariants !== "function") {
    throw new Error("Product module method updateProductVariants is unavailable")
  }

  const csvPath = path.resolve(process.cwd(), "../as_colour_medusa_import.csv")
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`)
  }

  logger.info(`Reading CSV from ${csvPath}`)
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"))
  const variantBySku = new Map<string, VariantImageData>()

  for (const row of rows) {
    const sku = row["Variant Sku"]
    if (!sku) {
      continue
    }

    const front = row["Product Image 1"] || row["Product Thumbnail"] || undefined
    const back = row["Product Image 2"] || undefined
    const color = getVariantColor(row)

    variantBySku.set(sku, { sku, color, front, back })
  }

  if (!variantBySku.size) {
    throw new Error("No variant SKUs found in CSV")
  }

  const skus = Array.from(variantBySku.keys())
  logger.info(`Found ${skus.length} unique variant SKUs in CSV`)

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata"],
    filters: {
      sku: skus,
    },
  })

  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []

  for (const variant of variants ?? []) {
    const sku = (variant as any).sku as string | undefined
    if (!sku) {
      continue
    }

    const csvVariant = variantBySku.get(sku)
    if (!csvVariant) {
      continue
    }

    const existingMetadata = ((variant as any).metadata ?? {}) as Record<string, unknown>
    const mergedMetadata: Record<string, unknown> = {
      ...existingMetadata,
      garment_color: csvVariant.color,
      garment_images: {
        front: csvVariant.front,
        back: csvVariant.back,
        all: [csvVariant.front, csvVariant.back].filter(Boolean),
      },
    }

    updates.push({
      id: (variant as any).id,
      metadata: mergedMetadata,
    })
  }

  if (!updates.length) {
    logger.info("No matching variants found to update")
    return
  }

  logger.info(`Updating ${updates.length} product variants with garment image metadata...`)

  for (const batch of chunk(updates, 100)) {
    for (const update of batch) {
      await productModuleService.updateProductVariants(update.id, {
        metadata: update.metadata,
      })
    }
  }

  logger.info("Variant garment image metadata backfill complete.")
}
