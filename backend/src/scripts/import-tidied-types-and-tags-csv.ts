/**
 * Read tidied_types_and_tags.csv (Type, Tags), ensure ProductType and ProductTag
 * records exist via the Product module, and write a type normalization map CSV.
 *
 * Usage (from backend/):
 *   pnpm run import-tidied-types-tags -- ../tidied_types_and_tags.csv
 *   pnpm run import-tidied-types-tags -- ../tidied_types_and_tags.csv --mapping-out ./data/map.csv
 *
 * Env:
 *   TIDIED_TYPES_TAGS_CSV — optional absolute path to input CSV (useful on Railway:
 *   the repo CSV is not in the image unless you copy it in or set this to a mounted path).
 *
 * You can pass multiple paths after `--`; the first one that exists as a file wins
 * (e.g. `npx medusa exec ... -- .. ../tidied_types_and_tags.csv`).
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type CsvRow = Record<string, string>

/** CSV `Type` column → canonical Medusa product type `value`. */
const CSV_TYPE_TO_MEDUSA: Record<string, string> = {
  "T-Shirt": "T-Shirts",
  Polo: "Polos",
  Hoodie: "Hoodies",
  Shirt: "Shirts",
  Sweatshirt: "Sweatshirts",
  Singlet: "Singlets / Tanks",
  "Longsleeve Shirt": "Longsleeves",
  "Shortsleeve Shirt": "Shirts",
  Other: "Other",
}

const LIST_PAGE_SIZE = 500

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

const normalizeTypeValue = (csvType: string): string => {
  const t = csvType.trim()
  if (!t) {
    return ""
  }
  return CSV_TYPE_TO_MEDUSA[t] ?? t
}

const resolveExistingPath = (candidates: string[], label: string) => {
  const tried: string[] = []
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    tried.push(resolved)
    try {
      const st = fs.statSync(resolved)
      if (st.isFile()) {
        return resolved
      }
    } catch {
      /* missing path */
    }
  }
  throw new Error(`${label} not found. Tried: ${tried.join(", ")}`)
}

const escapeCsvField = (s: string): string => {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

type ParsedCli = {
  /** Explicit CSV paths in order (each is tried until one exists as a file). */
  inputPaths: string[]
  mappingOut?: string
}

const parseCli = (rawArgs: string[]): ParsedCli => {
  const args = rawArgs ?? []
  let mappingOut: string | undefined
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--mapping-out") {
      mappingOut = args[i + 1]?.trim()
      if (mappingOut) {
        i++
      }
      continue
    }
    if (a && !a.startsWith("--")) {
      positional.push(a.trim())
    }
  }
  return {
    inputPaths: positional.filter(Boolean),
    mappingOut,
  }
}

type ProductTypeRow = { id: string; value: string }
type ProductTagRow = { id: string; value: string }

export default async function importTidiedTypesAndTagsCsv({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const cli = parseCli(args ?? [])

  const defaultCandidates = [
    ...cli.inputPaths,
    process.env.TIDIED_TYPES_TAGS_CSV?.trim() || "",
    path.resolve(process.cwd(), "tidied_types_and_tags.csv"),
    path.resolve(process.cwd(), "../tidied_types_and_tags.csv"),
  ].filter(Boolean)

  const csvPath = resolveExistingPath(defaultCandidates, "Tidied types/tags CSV")
  const mappingOutPath =
    cli.mappingOut && cli.mappingOut.length > 0
      ? path.resolve(cli.mappingOut)
      : path.join(path.dirname(csvPath), "tidied_types_normalization_map.csv")

  const productModule = container.resolve(Modules.PRODUCT) as {
    listProductTypes: (
      filters?: Record<string, unknown>,
      config?: { take?: number | null; skip?: number | null }
    ) => Promise<ProductTypeRow[]>
    createProductTypes: (data: Array<{ value: string }>) => Promise<ProductTypeRow[]>
    listProductTags: (
      filters?: Record<string, unknown>,
      config?: { take?: number | null; skip?: number | null }
    ) => Promise<ProductTagRow[]>
    createProductTags: (data: Array<{ value: string }>) => Promise<ProductTagRow[]>
  }

  for (const name of ["listProductTypes", "createProductTypes", "listProductTags", "createProductTags"] as const) {
    if (typeof productModule[name] !== "function") {
      throw new Error(`Product module method ${name} is not available`)
    }
  }

  const raw = fs.readFileSync(csvPath, "utf-8")
  const rows = parseCsv(raw)
  logger.info(`CSV: ${csvPath}`)
  logger.info(`Rows (excl. header): ${rows.length}`)

  const distinctCsvTypes = new Set<string>()
  const normalizedTypes = new Set<string>()
  const tagValues = new Set<string>()

  for (const row of rows) {
    const csvType = (row["Type"] || "").trim()
    if (!csvType) {
      continue
    }
    distinctCsvTypes.add(csvType)
    const norm = normalizeTypeValue(csvType)
    if (norm) {
      normalizedTypes.add(norm)
    }
    const tagsCell = row["Tags"] || ""
    for (const part of tagsCell.split(",")) {
      const t = part.trim()
      if (t) {
        tagValues.add(t)
      }
    }
  }

  const typeByLower = new Map<string, ProductTypeRow>()
  let typeSkip = 0
  while (true) {
    const batch = await productModule.listProductTypes(
      {},
      { take: LIST_PAGE_SIZE, skip: typeSkip }
    )
    for (const t of batch) {
      typeByLower.set(t.value.toLowerCase(), t)
    }
    if (batch.length < LIST_PAGE_SIZE) {
      break
    }
    typeSkip += batch.length
  }
  const typesToCreate = [...normalizedTypes].filter((v) => !typeByLower.has(v.toLowerCase()))
  let typesCreated = 0
  if (typesToCreate.length) {
    const created = await productModule.createProductTypes(typesToCreate.map((value) => ({ value })))
    typesCreated = created.length
    for (const t of created) {
      typeByLower.set(t.value.toLowerCase(), t)
    }
  }

  const tagByLower = new Map<string, ProductTagRow>()
  let tagSkip = 0
  while (true) {
    const batch = await productModule.listProductTags(
      {},
      { take: LIST_PAGE_SIZE, skip: tagSkip }
    )
    for (const t of batch) {
      tagByLower.set(t.value.toLowerCase(), t)
    }
    if (batch.length < LIST_PAGE_SIZE) {
      break
    }
    tagSkip += batch.length
  }

  const tagsToCreate = [...tagValues].filter((v) => !tagByLower.has(v.toLowerCase()))
  let tagsCreated = 0
  if (tagsToCreate.length) {
    const created = await productModule.createProductTags(tagsToCreate.map((value) => ({ value })))
    tagsCreated = created.length
    for (const t of created) {
      tagByLower.set(t.value.toLowerCase(), t)
    }
  }

  const mapLines = [
    "csv_type,normalized_type,label_changed",
    ...[...distinctCsvTypes]
      .sort()
      .map((csvType) => {
        const normalized = normalizeTypeValue(csvType)
        const changed = csvType !== normalized
        return [escapeCsvField(csvType), escapeCsvField(normalized), changed ? "true" : "false"].join(",")
      }),
  ]
  fs.writeFileSync(mappingOutPath, mapLines.join("\n") + "\n", "utf-8")

  logger.info(`Distinct CSV types: ${distinctCsvTypes.size}`)
  logger.info(`Distinct normalized types: ${normalizedTypes.size}`)
  logger.info(`Product types created: ${typesCreated}`)
  logger.info(`Distinct tag values: ${tagValues.size}`)
  logger.info(`Product tags created: ${tagsCreated}`)
  logger.info(`Normalization map written: ${mappingOutPath}`)
}
