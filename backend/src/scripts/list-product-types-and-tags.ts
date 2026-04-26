/**
 * Dump all product types and product tags (id + value) from the Product module.
 *
 * Usage (from backend/):
 *   pnpm run list-product-types-tags
 *   pnpm run list-product-types-tags -- --out ./data/product_types_and_tags.json
 *   pnpm run list-product-types-tags -- --format csv --out ./data/types_tags.csv
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const PAGE_SIZE = 500

type Row = { id: string; value: string }

type ParsedCli = {
  outPath?: string
  format: "json" | "csv"
}

const argvAfterMedusaDoubleDash = (): string[] => {
  const dash = process.argv.indexOf("--")
  if (dash === -1) {
    return []
  }
  return process.argv.slice(dash + 1).filter((x) => x && x !== "--")
}

const parseCli = (rawArgs: string[]): ParsedCli => {
  const args = [...argvAfterMedusaDoubleDash(), ...(rawArgs ?? [])].filter(
    (x) => x && x !== "--"
  )
  let outPath: string | undefined
  let format: "json" | "csv" = "json"
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--out") {
      outPath = args[i + 1]?.trim()
      if (outPath) {
        i++
      }
      continue
    }
    if (a === "--format") {
      const f = args[i + 1]?.trim().toLowerCase()
      if (f === "csv" || f === "json") {
        format = f
      }
      if (args[i + 1]) {
        i++
      }
      continue
    }
  }
  const envOut = process.env.LIST_TYPES_TAGS_OUT?.trim()
  return {
    outPath: outPath || envOut || undefined,
    format,
  }
}

const listAll = async <T extends Row>(
  fetchPage: (skip: number) => Promise<T[]>
): Promise<T[]> => {
  const all: T[] = []
  let skip = 0
  while (true) {
    const batch = await fetchPage(skip)
    all.push(...batch)
    if (batch.length < PAGE_SIZE) {
      break
    }
    skip += batch.length
  }
  return all
}

const sortByValue = (a: Row, b: Row) =>
  a.value.localeCompare(b.value, undefined, { sensitivity: "base" })

export default async function listProductTypesAndTags({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { outPath, format } = parseCli(args ?? [])

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProductTypes: (
      filters?: Record<string, unknown>,
      config?: { take?: number | null; skip?: number | null }
    ) => Promise<Row[]>
    listProductTags: (
      filters?: Record<string, unknown>,
      config?: { take?: number | null; skip?: number | null }
    ) => Promise<Row[]>
  }

  if (typeof productModule.listProductTypes !== "function") {
    throw new Error("listProductTypes is not available on product module")
  }
  if (typeof productModule.listProductTags !== "function") {
    throw new Error("listProductTags is not available on product module")
  }

  const [productTypes, productTags] = await Promise.all([
    listAll((skip) => productModule.listProductTypes({}, { take: PAGE_SIZE, skip })),
    listAll((skip) => productModule.listProductTags({}, { take: PAGE_SIZE, skip })),
  ])

  productTypes.sort(sortByValue)
  productTags.sort(sortByValue)

  const payload = {
    product_types: productTypes.map(({ id, value }) => ({ id, value })),
    product_tags: productTags.map(({ id, value }) => ({ id, value })),
  }

  let body: string
  if (format === "csv") {
    const lines = [
      "kind,id,value",
      ...productTypes.map((r) => `product_type,${escapeCsv(r.id)},${escapeCsv(r.value)}`),
      ...productTags.map((r) => `product_tag,${escapeCsv(r.id)},${escapeCsv(r.value)}`),
    ]
    body = lines.join("\n") + "\n"
  } else {
    body = JSON.stringify(payload, null, 2) + "\n"
  }

  if (outPath) {
    const resolved = path.resolve(outPath)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, body, "utf-8")
    logger.info(`Wrote ${resolved} (${productTypes.length} types, ${productTags.length} tags)`)
  } else {
    process.stdout.write(body)
    logger.info(`Listed ${productTypes.length} types, ${productTags.length} tags (stdout)`)
  }
}

function escapeCsv(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
