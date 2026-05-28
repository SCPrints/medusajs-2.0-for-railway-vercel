/**
 * Backfill colour-specific images for DNC products by re-reading the
 * source CSV (backend/data/DNC Workwear Volume 13 Price List - Product
 * data (CSV).csv). The CSV's `Image` column has the real per-colour
 * URL for every variant row, e.g.
 *
 *   ProductCode 110110061 (Trad Chef Jacket S/S Black XXS)
 *     → https://www.dncworkwear.com.au/images/hires/1101100.jpg
 *   ProductCode 110134961 (Trad Chef Jacket S/S White XXS)
 *     → https://www.dncworkwear.com.au/images/hires/1101349.jpg
 *
 * Why we need this: many DNC products only have one image right now
 * because (a) earlier imports only captured the parent-row image, and/or
 * (b) `_scrape-dnc-missing-images.ts` REPLACED images[] with a single
 * og:image when it filled in missing thumbnails. The CSV is the source
 * of truth and already has every colour's URL.
 *
 * Strategy:
 *   1. Read CSV, group rows the same way the importer does (rows whose
 *      ProductCode shares a prefix with the previous baseCode form one
 *      group → one Medusa product).
 *   2. Collect every distinct `Image` URL from each group.
 *   3. Derive the handle (`dnc-{baseCode_lowercased}`) and look up the
 *      product in the DB.
 *   4. Diff against existing images[]; HEAD-check only the new URLs to
 *      drop stale entries; merge survivors into images[].
 *
 * Idempotent: re-running adds nothing if the product already has every
 * CSV-derived URL.
 *
 * Run locally:
 *   pnpm --filter backend exec medusa exec src/scripts/_backfill-dnc-csv-images.ts
 *   pnpm --filter backend exec medusa exec src/scripts/_backfill-dnc-csv-images.ts -- --apply
 *
 * Run on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/_backfill-dnc-csv-images.js -- --apply
 *
 * Env:
 *   DNC_CDN_LIMIT=N    cap how many products to process (testing)
 *   DNC_CDN_APPLY=1    same as passing --apply
 *   DNC_CSV=path       override CSV path (default: data/DNC Workwear Volume 13...)
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const FETCH_TIMEOUT_MS = 8000
const DELAY_MS = 100 // ~10 req/sec
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

const DNC_CSV_FILENAMES = [
  "dnc-vol-13.csv",
  "DNC Workwear Volume 13 Price List - Product data (CSV).csv",
] as const

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const getApplyFlag = (args: string[] | undefined): boolean =>
  (args ?? []).includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.DNC_CDN_APPLY === "1" ||
  process.env.DNC_CDN_APPLY === "true"

type CsvRow = Record<string, string>

/* ---------- CSV parsing (same shape as the importer) ---------- */

const parseCsvLine = (line: string): string[] => {
  const out: string[] = []
  let value = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"'
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

const resolveCsvPath = (cwd: string): string => {
  const fromEnv = process.env.DNC_CSV?.trim()
  const candidates: string[] = []
  if (fromEnv) candidates.push(path.resolve(fromEnv))
  for (const name of DNC_CSV_FILENAMES) {
    candidates.push(path.resolve(cwd, "data", name))
    candidates.push(path.resolve(cwd, "backend", "data", name))
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    `DNC CSV not found. Set DNC_CSV or place one of: ${DNC_CSV_FILENAMES.join(", ")} under data/. Tried: ${candidates.join(", ")}`
  )
}

/* ---------- Grouping (same algorithm as importer) ---------- */

const isHeaderRow = (row: CsvRow): boolean =>
  !(row["Description2"] || "").trim() && !(row["Description3"] || "").trim()

type DncGroup = { baseCode: string; rows: CsvRow[] }

const groupDncRows = (rows: CsvRow[]): DncGroup[] => {
  const groups: DncGroup[] = []
  let current: CsvRow[] = []
  let baseCode: string | null = null

  const flush = () => {
    if (current.length && baseCode) groups.push({ baseCode, rows: current })
    current = []
    baseCode = null
  }

  for (const row of rows) {
    const code = (row["ProductCode"] || "").trim()
    if (!code) continue

    if (!current.length) {
      current = [row]
      baseCode = code
      continue
    }

    if (code.startsWith(baseCode!)) {
      current.push(row)
      continue
    }

    flush()
    current = [row]
    baseCode = code
  }
  flush()
  return groups
}

const slugifyHandle = (code: string) =>
  code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "product"

/* ---------- HEAD-check ---------- */

const headOk = async (url: string): Promise<boolean> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    clearTimeout(timer)
    return false
  }
}

/* ---------- Main ---------- */

type DbProduct = {
  id: string
  handle: string
  thumbnail: string | null
  images: Array<{ url: string }>
}

export default async function backfillDncCsvImages({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const apply = getApplyFlag(args)
  const limitEnv = Number.parseInt(process.env.DNC_CDN_LIMIT ?? "", 10)
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : Infinity

  logger.info(`DNC CSV image backfill — ${apply ? "APPLY" : "DRY RUN"}`)
  if (limit !== Infinity) logger.info(`Cap: DNC_CDN_LIMIT=${limit}`)

  // 1. Load + parse CSV.
  const csvPath = resolveCsvPath(process.cwd())
  logger.info(`CSV: ${path.basename(csvPath)}`)
  const csv = parseCsv(fs.readFileSync(csvPath, "utf-8"))
  logger.info(`CSV rows: ${csv.length}`)

  // 2. Build handle → distinct image URLs map from CSV.
  const groups = groupDncRows(csv)
  logger.info(`CSV groups: ${groups.length}`)

  const csvImagesByHandle = new Map<string, string[]>()
  for (const g of groups) {
    const urls = new Set<string>()
    for (const r of g.rows) {
      const u = (r["Image"] || "").trim()
      if (u && /^https?:\/\//i.test(u)) urls.add(u)
    }
    if (urls.size === 0) continue
    const handle = `dnc-${slugifyHandle(g.baseCode)}`
    // A baseCode can appear once (and the group is just the header row
    // with extras). Merge if we ever encounter the same handle twice
    // (defensive — the grouping algorithm shouldn't produce duplicates).
    const existing = csvImagesByHandle.get(handle)
    if (existing) {
      for (const u of urls) if (!existing.includes(u)) existing.push(u)
    } else {
      csvImagesByHandle.set(handle, Array.from(urls))
    }
  }
  logger.info(`Handles with CSV image URLs: ${csvImagesByHandle.size}`)

  // 3. Walk every dnc-* product in DB.
  const { data: all } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.url"],
    filters: { handle: { $like: "dnc-%" } },
    pagination: { take: 5000 },
  })
  const products = (all ?? []) as DbProduct[]
  logger.info(`DB dnc-* products: ${products.length}`)

  let processed = 0
  let noCsvMatch = 0
  let nothingNew = 0
  let addedTotal = 0
  let missedTotal = 0
  let updatedProducts = 0

  for (const p of products) {
    if (processed >= limit) break

    const csvUrls = csvImagesByHandle.get(p.handle)
    if (!csvUrls || csvUrls.length === 0) {
      noCsvMatch++
      continue
    }

    processed++
    const existingUrls = new Set(
      (p.images ?? []).map((i) => i.url).filter(Boolean)
    )
    const toProbe = csvUrls.filter((u) => !existingUrls.has(u))
    if (toProbe.length === 0) {
      nothingNew++
      continue
    }

    const hits: string[] = []
    const misses: string[] = []
    for (const url of toProbe) {
      if (await headOk(url)) hits.push(url)
      else misses.push(url)
      await sleep(DELAY_MS)
    }

    if (hits.length === 0) {
      missedTotal += misses.length
      logger.info(
        `  [${processed}] ${p.handle}: 0/${toProbe.length} hits (CSV URLs stale)`
      )
      continue
    }

    addedTotal += hits.length
    missedTotal += misses.length
    for (const u of hits) existingUrls.add(u)

    if (apply) {
      try {
        await productModule.updateProducts(p.id, {
          thumbnail: p.thumbnail || hits[0],
          images: Array.from(existingUrls).map((url) => ({ url })),
        })
        updatedProducts++
        logger.info(
          `  [${processed}] ${p.handle}: +${hits.length} / -${misses.length} ✓`
        )
      } catch (e: any) {
        logger.warn(
          `  [${processed}] ${p.handle}: update failed — ${e?.message ?? e}`
        )
      }
    } else {
      logger.info(
        `  [${processed}] [dry] ${p.handle}: would add ${hits.length}, missed ${misses.length}`
      )
      if (processed <= 5) {
        for (const u of hits) logger.info(`        +${u}`)
        for (const u of misses) logger.info(`        ×${u}`)
      }
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Processed:                 ${processed}`)
  logger.info(`No CSV match:              ${noCsvMatch}`)
  logger.info(`Nothing new (up-to-date):  ${nothingNew}`)
  logger.info(`URLs added:                ${addedTotal}`)
  logger.info(`URLs missed (404):         ${missedTotal}`)
  logger.info(
    `Products updated:          ${updatedProducts}${apply ? "" : " (dry run — no writes)"}`
  )
}
