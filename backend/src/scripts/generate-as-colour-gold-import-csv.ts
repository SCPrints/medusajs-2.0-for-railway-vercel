/**
 * Writes a new Medusa-style product CSV by merging a gold AS Colour cost sheet (STYLECODE + PRICE)
 * into an existing export (one row per variant). Updates AUD wholesale columns + Variant Bulk Pricing JSON.
 *
 * Usage (from backend/):
 *   npm run generate-as-colour-gold-import-csv -- <gold-cost.csv> <existing-export.csv> <output.csv>
 *
 * Only rows whose Product Handle starts with `as-colour-` get pricing filled (others copied unchanged).
 *
 * Supplemental columns:
 * - Variant Price AUD = best bulk price (100+ tier), major units.
 * - BASE_SALE_PRICE / TIER_* = legacy four spreadsheet slots (10–49 column holds 10–19 band AUD; 20–49 band is JSON-only).
 * - Variant Bulk Pricing JSON = canonical five tiers; amounts are minor units (cents), matching DB metadata.
 */

import fs from "node:fs"
import path from "node:path"

import { PRODUCT_IMPORT_CSV_HEADERS } from "../admin/lib/product-import-template-csv"
import { tiersFromCostMinor } from "../utils/as-colour-tier-math"
import { parseMoneyToMinor } from "../utils/parse-money-to-minor"

type CsvRow = Record<string, string>

type ExtendedSizeBand = "4XL" | "5XL"

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

const extractStyleCodeFromHandle = (handle?: string) => {
  if (!handle) {
    return ""
  }

  const normalized = handle.trim().toUpperCase()
  const parts = normalized.split("-").filter(Boolean)
  const tail = parts[parts.length - 1] ?? ""
  return tail.replace(/[^A-Z0-9]/g, "")
}

const minorToMajorStr = (minor: number): string => String(minor / 100)

const buildGoldCostLookup = (
  rows: CsvRow[]
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const row of rows) {
    const styleCode = normalizeStyleCode(row["STYLECODE"])
    if (!styleCode) {
      continue
    }
    const costMinor = parseMoneyToMinor(row["PRICE"])
    if (costMinor === null || costMinor <= 0) {
      continue
    }
    const band = parseExtendedSizeBandFromProductName(row["PRODUCT_NAME"])
    const key = stylePricingLookupKey(styleCode, band)
    map.set(key, costMinor)
  }
  return map
}

const resolveCostMinorForVariantRow = (
  row: CsvRow,
  lookup: Map<string, number>
): number | null => {
  const handle = row["Product Handle"]
  const sku = row["Variant Sku"] ?? row["Variant SKU"]
  const handleStyleCode = normalizeStyleCode(extractStyleCodeFromHandle(handle))
  const skuBand = extractExtendedSizeBandFromSku(sku)

  const candidates = Array.from(
    new Set([handleStyleCode, ...extractStyleCodeCandidatesFromSku(sku)].filter(Boolean) as string[])
  )

  for (const code of candidates) {
    if (skuBand) {
      const extendedHit = lookup.get(stylePricingLookupKey(code, skuBand))
      if (extendedHit !== undefined) {
        return extendedHit
      }
    }
    const baseHit = lookup.get(code)
    if (baseHit !== undefined) {
      return baseHit
    }
  }

  return null
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

const headersFromFirstRow = (raw: string): string[] => {
  const firstLine = raw.split(/\r?\n/).find((l) => l.trim().length > 0)
  return firstLine ? parseCsvLine(firstLine) : []
}

function applyPricingToRow(row: CsvRow, costMinor: number): void {
  const tiers = tiersFromCostMinor(costMinor)

  const t1 = tiers.find((t) => t.min_quantity === 1)?.amount
  const t10 = tiers.find((t) => t.min_quantity === 10)?.amount
  const t50 = tiers.find((t) => t.min_quantity === 50)?.amount
  const t100 = tiers.find((t) => t.min_quantity === 100)?.amount

  if (t1 === undefined || t10 === undefined || t50 === undefined || t100 === undefined) {
    throw new Error("tiersFromCostMinor returned unexpected shape")
  }

  /** Legacy header “10–49” holds the 10–19 band (AUD major); 20–49 only appears in JSON. */
  row["BASE_SALE_PRICE"] = minorToMajorStr(t1)
  row["TIER_10_TO_49_PRICE"] = minorToMajorStr(t10)
  row["TIER_50_TO_99_PRICE"] = minorToMajorStr(t50)
  row["TIER_100_PLUS_PRICE"] = minorToMajorStr(t100)
  row["Variant Price AUD"] = minorToMajorStr(t100)

  row["Variant Bulk Pricing JSON"] = JSON.stringify({
    source: "generate-as-colour-gold-import-csv",
    currency_code: "aud",
    tiers: tiers.map((tier) => ({
      min_quantity: tier.min_quantity,
      ...(typeof tier.max_quantity === "number" ? { max_quantity: tier.max_quantity } : {}),
      amount: tier.amount,
    })),
  })
}

function main() {
  const argv = process.argv.slice(2).filter((a) => a !== "--")
  if (argv.length < 3) {
    console.error(
      "Usage: npm run generate-as-colour-gold-import-csv -- <gold-cost.csv> <product-export.csv> <output.csv>"
    )
    process.exit(1)
  }

  const goldPath = path.resolve(argv[0])
  const templatePath = path.resolve(argv[1])
  const outPath = path.resolve(argv[2])

  if (!fs.existsSync(goldPath)) {
    console.error(`Gold CSV not found: ${goldPath}`)
    process.exit(1)
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`Template CSV not found: ${templatePath}`)
    process.exit(1)
  }

  const goldRows = parseCsv(fs.readFileSync(goldPath, "utf8"))
  const lookup = buildGoldCostLookup(goldRows)

  const rawTemplate = fs.readFileSync(templatePath, "utf8")
  const templateHeadersRaw = headersFromFirstRow(rawTemplate)
  const headers = ensureHeadersFromTemplate(templateHeadersRaw)

  const dataRows = parseCsv(rawTemplate)

  let filled = 0
  let unmatched = 0
  let skippedNonAsColour = 0

  const outputLines: string[] = [stringifyCsvRow(headers)]

  for (const row of dataRows) {
    const handle = (row["Product Handle"] ?? "").trim().toLowerCase()
    if (!handle.startsWith("as-colour-")) {
      skippedNonAsColour++
      outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
      continue
    }

    const costMinor = resolveCostMinorForVariantRow(row, lookup)
    if (costMinor === null) {
      unmatched++
      outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
      continue
    }

    applyPricingToRow(row, costMinor)
    filled++
    outputLines.push(stringifyCsvRow(rowRecordToCells(headers, row)))
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, `${outputLines.join("\n")}\n`, "utf8")

  console.info(`Wrote ${outPath}`)
  console.info(
    `Rows: total=${dataRows.length}, pricing filled=${filled}, gold lookup miss=${unmatched}, non–AS Colour skipped=${skippedNonAsColour}`
  )
}

main()
