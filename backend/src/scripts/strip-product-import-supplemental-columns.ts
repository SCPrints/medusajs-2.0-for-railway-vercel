#!/usr/bin/env node
/**
 * Medusa Admin "Import Product List" accepts only the **42** core template columns —
 * see `PRODUCT_IMPORT_TEMPLATE_COLUMNS` in product-import-template-csv.ts.
 *
 * Extended exports (AUD tiers, bulk JSON, collection title strings, etc.) are **rejected**.
 * This script removes supplemental columns so the CSV passes validation.
 *
 * **Pricing:** Core template has `Variant Price EUR` and `Variant Price USD` only — no AUD column.
 * By default we set `Variant Price USD` from `Variant Price AUD` when USD is empty (typical AU B2B exports).
 *
 * **Limits:** Quantity tiers and `bulk_pricing` metadata cannot be applied via native CSV import.
 * For AUD tiers + metadata use: `pnpm run update-as-colour-pricing -- -- --apply`.
 *
 * Usage (from backend/ or repo root with `pnpm --dir backend run …`):
 *   pnpm run strip-product-import-supplemental -- --input ./data/as_colour_pricing_corrected.csv --out ./data/as_colour_import_medusa_native.csv
 */

import fs from "node:fs"
import path from "node:path"

import { PRODUCT_IMPORT_TEMPLATE_COLUMNS } from "../admin/lib/product-import-template-csv"

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
        if (current.length > 0 || records.length > 0) records.push(current)
        current = ""
        continue
      }
      if (ch === "\r") {
        if (raw[i + 1] === "\n") i++
        if (current.length > 0 || records.length > 0) records.push(current)
        current = ""
        continue
      }
    }
    current += ch
  }
  if (current.length > 0 || records.length > 0) records.push(current)
  return records.filter((r) => r.trim().length > 0)
}

const parseCsv = (raw: string): CsvRow[] => {
  const lines = splitCsvRecords(raw)
  if (!lines.length) return []
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
  if (/[",\r\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

function toCoreRow(row: CsvRow, opts: { mapAudToUsd: boolean }): CsvRow {
  const core: CsvRow = {}
  for (const col of PRODUCT_IMPORT_TEMPLATE_COLUMNS) {
    core[col] = row[col] ?? ""
  }
  if (opts.mapAudToUsd) {
    const aud = (row["Variant Price AUD"] ?? "").trim()
    const usd = (core["Variant Price USD"] ?? "").trim()
    if (aud && !usd) {
      core["Variant Price USD"] = aud
    }
  }
  return core
}

function parseFlags(): { inputPath: string; outputPath: string; mapAudToUsd: boolean } | null {
  const argv = process.argv.slice(2).filter((a) => a !== "--")
  let inputPath = ""
  let outputPath = ""
  let mapAudToUsd = true

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--input" && argv[i + 1]) {
      inputPath = path.resolve(argv[++i])
      continue
    }
    if (a === "--out" && argv[i + 1]) {
      outputPath = path.resolve(argv[++i])
      continue
    }
    if (a === "--no-aud-to-usd") {
      mapAudToUsd = false
      continue
    }
    if (a.startsWith("--")) {
      console.error(`Unknown option: ${a}`)
      return null
    }
    if (!inputPath) inputPath = path.resolve(a)
    else if (!outputPath) outputPath = path.resolve(a)
  }

  if (!inputPath || !outputPath) return null
  return { inputPath, outputPath, mapAudToUsd }
}

function main(): void {
  const parsed = parseFlags()
  if (!parsed) {
    console.error(
      "Usage: pnpm run strip-product-import-supplemental -- --input <wide-export.csv> --out <core-only.csv>\n" +
        "       [--no-aud-to-usd]  (default: fill Variant Price USD from Variant Price AUD when USD empty)"
    )
    process.exit(1)
  }

  const { inputPath, outputPath, mapAudToUsd } = parsed

  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`)
    process.exit(1)
  }

  const rows = parseCsv(fs.readFileSync(inputPath, "utf8"))
  const headers = [...PRODUCT_IMPORT_TEMPLATE_COLUMNS]

  const lines: string[] = [headers.map(escapeCsvField).join(",")]
  for (const row of rows) {
    const core = toCoreRow(row, { mapAudToUsd })
    lines.push(headers.map((h) => escapeCsvField(core[h] ?? "")).join(","))
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, "\uFEFF" + lines.join("\n") + "\n", "utf8")
  console.info(`Wrote ${outputPath} (${rows.length} data rows, ${headers.length} columns)`)
}

main()
