#!/usr/bin/env node
/**
 * Merge `as_colour_final_website_pricing.csv` (explicit BASE_SALE_PRICE / TIER_* AUD columns) into a
 * full Medusa variant export: sets supplemental AUD columns + `Variant Bulk Pricing JSON` for `as-colour-*`
 * rows. Matches tier resolution to `update-as-colour-pricing.ts` (explicit mode).
 *
 * **Medusa Admin "Import Product List" (core importer):** rejects supplemental columns (`Variant Price AUD`,
 * tier columns, `Variant Bulk Pricing JSON`, etc.). Strip them first:
 *   `pnpm run strip-product-import-supplemental -- --input ./data/as_colour_pricing_corrected.csv --out ./data/import_ready.csv`
 * That output has only the official 42 columns; AUD is copied into `Variant Price USD` when USD is empty.
 * Native import still **cannot** set quantity tiers or `bulk_pricing` metadata — use `update-as-colour-pricing` for that.
 *
 * **Import note:** Medusa Admin in this repo exports the wide template via the product CSV widget; for direct
 * DB updates with full tiers use:
 *   `pnpm run update-as-colour-pricing -- -- --apply`
 *
 * Usage (from repo root or `backend/`):
 *   pnpm run generate-as-colour-website-pricing-import-csv -- \\
 *     --pricing ./data/as_colour_final_website_pricing.csv \\
 *     --export /path/to/medusa-product-export.csv \\
 *     --out ./data/as_colour_pricing_corrected.csv \\
 *     [--only-changed]
 *
 * Positional (optional): `<export.csv> <output.csv>` if `--export` / `--out` omitted.
 */

import fs from "node:fs"
import path from "node:path"

import { PRODUCT_IMPORT_CSV_HEADERS } from "../admin/lib/product-import-template-csv"
import {
  applyExplicitStylePricingToMedusaExportRow,
  buildExplicitStylePricingMapFromCsvRows,
  explicitPricingDiffersFromExportRow,
  resolveStylePricingForHandlesAndSku,
} from "../utils/as-colour-explicit-pricing-from-csv"

type CsvRow = Record<string, string>

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

/** Record boundaries respecting quoted fields (handles multiline description cells). */
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

const parseCsvMultiline = (raw: string): CsvRow[] => {
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

/** Website pricing sheet is normally single-line rows; supports quoted commas. */
const parseCsvSimpleLinePerRow = (raw: string): CsvRow[] => {
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

const escapeCsvField = (val: string): string => {
  if (/[",\r\n]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

const stringifyCsvRow = (cells: string[]): string => cells.map(escapeCsvField).join(",")

const ensureHeadersFromTemplate = (headersFromFile: string[]): string[] => {
  const set = new Set(headersFromFile)
  const out = [...headersFromFile]
  for (const h of PRODUCT_IMPORT_CSV_HEADERS) {
    if (!set.has(h)) {
      out.push(h)
      set.add(h)
    }
  }
  return out
}

const rowRecordToCells = (headers: string[], row: CsvRow): string[] =>
  headers.map((h) => row[h] ?? "")

const headersFromExportRaw = (raw: string): string[] => {
  const records = splitCsvRecords(raw)
  if (!records.length) {
    return []
  }
  return parseCsvLine(records[0])
}

type CliArgs = {
  pricingPath: string
  exportPath: string
  outPath: string
  onlyChanged: boolean
}

const DEFAULT_PRICING = path.resolve(process.cwd(), "data", "as_colour_final_website_pricing.csv")

function parseArgv(argvIn: string[]): CliArgs | null {
  const argv = argvIn.filter((a) => a !== "--")
  let pricingPath = DEFAULT_PRICING
  let exportPath = ""
  let outPath = ""
  let onlyChanged = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]

    if (a === "--only-changed") {
      onlyChanged = true
      continue
    }

    if (a === "--pricing" && argv[i + 1]) {
      pricingPath = path.resolve(argv[++i])
      continue
    }

    if (a === "--export" && argv[i + 1]) {
      exportPath = path.resolve(argv[++i])
      continue
    }

    if (a === "--out" && argv[i + 1]) {
      outPath = path.resolve(argv[++i])
      continue
    }

    if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`)
      return null
    }

    if (!exportPath) {
      exportPath = path.resolve(a)
    } else if (!outPath) {
      outPath = path.resolve(a)
    }
  }

  if (!exportPath || !outPath) {
    return null
  }

  return { pricingPath, exportPath, outPath, onlyChanged }
}

function main(): void {
  const parsed = parseArgv(process.argv.slice(2).filter((a) => a !== "--"))
  if (!parsed) {
    console.error(
      "Usage: pnpm run generate-as-colour-website-pricing-import-csv -- --pricing <website.csv> --export <medusa-export.csv> --out <output.csv> [--only-changed]\n" +
        "       (defaults: pricing → backend/data/as_colour_final_website_pricing.csv when cwd is backend)\n" +
        "       Positional: <export.csv> <output.csv>"
    )
    process.exit(1)
  }

  const { pricingPath, exportPath, outPath, onlyChanged } = parsed

  if (!fs.existsSync(pricingPath)) {
    console.error(`Pricing CSV not found: ${pricingPath}`)
    process.exit(1)
  }
  if (!fs.existsSync(exportPath)) {
    console.error(`Export CSV not found: ${exportPath}`)
    if (
      /\/path\/to\b/i.test(exportPath) ||
      /your-medusa/i.test(exportPath) ||
      /medusa-product-export\.csv$/i.test(exportPath)
    ) {
      console.error(
        "That path was a documentation placeholder. Use the real file path to your Medusa product/export CSV (from Admin → CSV export), e.g. ~/Downloads/products-import-template.csv"
      )
    } else {
      console.error(
        "Check the path exists. --export must point to your downloaded Medusa variant export (one row per variant)."
      )
    }
    process.exit(1)
  }

  const pricingRows = parseCsvSimpleLinePerRow(fs.readFileSync(pricingPath, "utf8"))
  const { byLookupKey, duplicateLookupKeys } =
    buildExplicitStylePricingMapFromCsvRows(pricingRows)

  if (!byLookupKey.size) {
    console.error("No valid explicit style pricing rows found in pricing CSV.")
    process.exit(1)
  }

  if (duplicateLookupKeys.length > 0) {
    console.warn(
      `Duplicate STYLECODE(+band) keys in pricing sheet (last row wins): ${duplicateLookupKeys.join(", ")}`
    )
  }

  const bulkJsonSource = path.basename(pricingPath)
  const rawExport = fs.readFileSync(exportPath, "utf8")
  const templateHeadersRaw = headersFromExportRaw(rawExport)
  const headers = ensureHeadersFromTemplate(templateHeadersRaw)
  const dataRows = parseCsvMultiline(rawExport)

  let patched = 0
  let unmatched = 0
  let skippedNonAsColour = 0
  let omittedUnchanged = 0

  const outputLines: string[] = [stringifyCsvRow(headers)]

  for (const row of dataRows) {
    const handle = (row["Product Handle"] ?? "").trim().toLowerCase()

    if (!handle.startsWith("as-colour-")) {
      skippedNonAsColour++
      if (!onlyChanged) {
        outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
      }
      continue
    }

    const sku = row["Variant Sku"] ?? row["Variant SKU"]
    const pricing = resolveStylePricingForHandlesAndSku(row["Product Handle"], sku, undefined, byLookupKey)

    if (!pricing) {
      unmatched++
      if (!onlyChanged) {
        outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
      }
      continue
    }

    const wouldChange = explicitPricingDiffersFromExportRow(row, pricing, bulkJsonSource)
    if (wouldChange) {
      applyExplicitStylePricingToMedusaExportRow(row, pricing, bulkJsonSource)
      patched++
      outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
    } else {
      omittedUnchanged++
      if (!onlyChanged) {
        outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
      }
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })

  const bom = "\uFEFF"
  fs.writeFileSync(outPath, bom + `${outputLines.join("\n")}\n`, "utf8")

  console.info(`Wrote ${outPath}`)
  console.info(
    `Rows read=${dataRows.length}, AS Colour pricing applied=${patched}, ` +
      `no style match=${unmatched}, non–AS Colour rows=${skippedNonAsColour}` +
      (onlyChanged ? `, unchanged AS Colour omitted=${omittedUnchanged}` : `, unchanged AS Colour copied=${omittedUnchanged}`)
  )
}

main()
