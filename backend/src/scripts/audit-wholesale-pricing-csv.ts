#!/usr/bin/env node
/**
 * Offline audit of Medusa product-export CSV: finds variants with suspicious AUD band prices.
 *
 * Includes a row when:
 * - Any of the five AUD columns parses to strictly between 0 and 1 (`below_1_aud`), OR
 * - TIER_100_PLUS_PRICE parses to [1, 5) — optional heuristic for bulky items priced around ~$2 (`tier100_below_5_aud`).
 *
 * Usage (from backend/):
 *   node -r ts-node/register/transpile-only ./src/scripts/audit-wholesale-pricing-csv.ts -- --input /path/to/export.csv --out-dir ./audit-out
 *
 * npm:
 *   pnpm run audit-pricing-csv -- --input /path/to/export.csv --out-dir ./audit-out
 *
 * Outputs:
 *   - products-suspicious-pricing-variants.csv
 *   - products-suspicious-pricing-products.csv
 */

import fs from "node:fs"
import path from "node:path"

type CsvRow = Record<string, string>

const AUD_COLUMNS = [
  "Variant Price AUD",
  "BASE_SALE_PRICE",
  "TIER_10_TO_49_PRICE",
  "TIER_50_TO_99_PRICE",
  "TIER_100_PLUS_PRICE",
] as const

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

const parseMoney = (s: string): number | null => {
  if (!s) {
    return null
  }
  const normalized = s.replace(/[^0-9.-]/g, "")
  if (!normalized) {
    return null
  }
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

const csvEscape = (v: string): string => {
  const needs =
    /[",\r\n]/.test(v)
  if (!needs) {
    return v
  }
  return `"${v.replace(/"/g, '""')}"`
}

const writeCsvRows = (
  filePath: string,
  columns: readonly string[],
  rows: Record<string, string>[]
): void => {
  const header = columns.map(csvEscape).join(",")
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(row[c] ?? "")).join(",")
  )
  const bom = "\uFEFF"
  fs.writeFileSync(filePath, bom + header + "\n" + lines.join("\n"), "utf8")
}

const parseFlags = (): { input: string | null; outDir: string } => {
  const argv = process.argv.slice(2)
  let input: string | null = null
  let outDir = process.cwd()

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--") {
      continue
    }
    if (a === "--input" && argv[i + 1]) {
      input = argv[++i]
      continue
    }
    if (a === "--out-dir" && argv[i + 1]) {
      outDir = path.resolve(argv[++i])
      continue
    }
    if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`)
      process.exit(1)
    }
    if (!input) {
      input = path.resolve(a)
    }
  }

  return { input, outDir }
}

function collectAudNumbers(row: CsvRow): number[] {
  const nums: number[] = []
  for (const col of AUD_COLUMNS) {
    const n = parseMoney(row[col] ?? "")
    if (n !== null) {
      nums.push(n)
    }
  }
  return nums
}

function tier100Parsed(row: CsvRow): number | null {
  return parseMoney(row["TIER_100_PLUS_PRICE"] ?? "")
}

function variantIncludeAndFlags(row: CsvRow): {
  include: boolean
  flags: string[]
  minAud: string
  maxAud: string
} {
  const nums = collectAudNumbers(row)
  let below1Aud = false
  for (const n of nums) {
    if (n > 0 && n < 1) {
      below1Aud = true
      break
    }
  }

  const t100 = tier100Parsed(row)
  const tier100Below5 =
    t100 !== null && t100 >= 1 && t100 < 5

  const include = below1Aud || tier100Below5

  const flags: string[] = []
  if (below1Aud) {
    flags.push("below_1_aud")
  }
  if (tier100Below5) {
    flags.push("tier100_below_5_aud")
  }

  let minAud = ""
  let maxAud = ""
  if (nums.length > 0) {
    minAud = String(Math.min(...nums))
    maxAud = String(Math.max(...nums))
  }

  return { include, flags, minAud, maxAud }
}

function main(): void {
  const { input, outDir } = parseFlags()
  if (!input) {
    console.error(
      "Usage: node ... audit-wholesale-pricing-csv.ts -- --input <export.csv> [--out-dir <dir>]"
    )
    process.exit(1)
  }

  const resolvedInput = path.resolve(input)
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input file not found: ${resolvedInput}`)
    process.exit(1)
  }

  fs.mkdirSync(outDir, { recursive: true })

  const raw = fs.readFileSync(resolvedInput, "utf8")
  const rows = parseCsv(raw)

  type VariantRow = Record<string, string>
  const variantOut: VariantRow[] = []

  for (const row of rows) {
    const { include, flags, minAud, maxAud } = variantIncludeAndFlags(row)
    if (!include) {
      continue
    }
    variantOut.push({
      "Product Id": row["Product Id"] ?? "",
      "Product Handle": row["Product Handle"] ?? "",
      "Product Title": row["Product Title"] ?? "",
      "Product Status": row["Product Status"] ?? "",
      "Variant Id": row["Variant Id"] ?? "",
      "Variant Title": row["Variant Title"] ?? "",
      "Variant SKU": row["Variant SKU"] ?? "",
      "Variant Price AUD": row["Variant Price AUD"] ?? "",
      BASE_SALE_PRICE: row["BASE_SALE_PRICE"] ?? "",
      TIER_10_TO_49_PRICE: row["TIER_10_TO_49_PRICE"] ?? "",
      TIER_50_TO_99_PRICE: row["TIER_50_TO_99_PRICE"] ?? "",
      TIER_100_PLUS_PRICE: row["TIER_100_PLUS_PRICE"] ?? "",
      min_aud: minAud,
      max_aud: maxAud,
      flags: flags.join(";"),
    })
  }

  const byProduct = new Map<
    string,
    {
      handle: string
      title: string
      status: string
      count: number
      globalMin: number | null
      globalMax: number | null
    }
  >()

  for (const v of variantOut) {
    const pid = v["Product Id"]
    if (!pid) {
      continue
    }
    const minN = parseMoney(v.min_aud ?? "")
    const maxN = parseMoney(v.max_aud ?? "")
    const agg = byProduct.get(pid)
    if (!agg) {
      byProduct.set(pid, {
        handle: v["Product Handle"] ?? "",
        title: v["Product Title"] ?? "",
        status: v["Product Status"] ?? "",
        count: 1,
        globalMin: minN,
        globalMax: maxN,
      })
      continue
    }
    agg.count += 1
    if (minN !== null) {
      agg.globalMin =
        agg.globalMin === null ? minN : Math.min(agg.globalMin, minN)
    }
    if (maxN !== null) {
      agg.globalMax =
        agg.globalMax === null ? maxN : Math.max(agg.globalMax, maxN)
    }
  }

  const productRows: VariantRow[] = [...byProduct.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, a]) => ({
      product_id: productId,
      product_handle: a.handle,
      product_title: a.title,
      product_status: a.status,
      flagged_variant_count: String(a.count),
      min_aud_across_variants:
        a.globalMin === null ? "" : String(a.globalMin),
      max_aud_across_variants:
        a.globalMax === null ? "" : String(a.globalMax),
    }))

  const variantsPath = path.join(
    outDir,
    "products-suspicious-pricing-variants.csv"
  )
  const productsPath = path.join(
    outDir,
    "products-suspicious-pricing-products.csv"
  )

  writeCsvRows(
    variantsPath,
    [
      "Product Id",
      "Product Handle",
      "Product Title",
      "Product Status",
      "Variant Id",
      "Variant Title",
      "Variant SKU",
      "Variant Price AUD",
      "BASE_SALE_PRICE",
      "TIER_10_TO_49_PRICE",
      "TIER_50_TO_99_PRICE",
      "TIER_100_PLUS_PRICE",
      "min_aud",
      "max_aud",
      "flags",
    ],
    variantOut
  )

  writeCsvRows(
    productsPath,
    [
      "product_id",
      "product_handle",
      "product_title",
      "product_status",
      "flagged_variant_count",
      "min_aud_across_variants",
      "max_aud_across_variants",
    ],
    productRows
  )

  console.log(
    `Wrote ${variantOut.length} variant rows → ${variantsPath}; ${productRows.length} products → ${productsPath}`
  )
}

main()
