/**
 * Trim the live AS Colour catalog to a reduced allowlist (by STYLECODE in a CSV).
 *
 * - Products with handle `as-colour-*` whose style code (last handle segment) is in the CSV → Published
 * - Other `as-colour-*` products → Draft (hidden from Store API; remains in Admin)
 *
 * Usage (from `backend/`):
 *   pnpm run trim-as-colour-catalog
 *   pnpm run trim-as-colour-catalog -- --apply
 *
 * Env:
 *   AS_COLOUR_ALLOWLIST_CSV — optional absolute path to CSV (default: backend/data/as_colour_filtered_with_polos.csv)
 *   AS_COLOUR_CATALOG_TRIM_APPLY=1 — same as `--apply`
 *
 * After production:
 *   - If Meilisearch is enabled, reindex products or wait for plugin sync so search matches the catalog.
 *   - Invalidate Next.js / CDN caches for product listing pages if applicable.
 */

import fs from "node:fs"
import path from "node:path"

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"

type CsvRow = Record<string, string>

const PAGE_SIZE = 500

const DEFAULT_ALLOWLIST_CSV_CANDIDATES = [
  process.env.AS_COLOUR_ALLOWLIST_CSV?.trim() || "",
  path.resolve(process.cwd(), "data", "as_colour_filtered_with_polos.csv"),
  path.resolve(process.cwd(), "../as_colour_filtered_with_polos.csv"),
].filter(Boolean)

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

const resolveExistingPath = (candidates: string[], label: string) => {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (fs.existsSync(resolved)) {
      return resolved
    }
  }

  throw new Error(
    `${label} not found. Tried: ${candidates.map((p) => path.resolve(p)).join(", ")}`
  )
}

/** Same as update-as-colour-pricing.ts — keep in sync for style resolution. */
const normalizeStyleCode = (value?: string) => value?.trim().toUpperCase() || ""

const extractStyleCodeFromHandle = (handle?: string) => {
  if (!handle) {
    return ""
  }

  const normalized = handle.trim().toUpperCase()
  const parts = normalized.split("-").filter(Boolean)
  const tail = parts[parts.length - 1] ?? ""
  return tail.replace(/[^A-Z0-9]/g, "")
}

const getApplyFlag = (args: string[]) =>
  args.includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.AS_COLOUR_CATALOG_TRIM_APPLY === "1" ||
  process.env.AS_COLOUR_CATALOG_TRIM_APPLY === "true"

type ProductRow = {
  id: string
  handle?: string | null
  status?: string | null
}

export default async function trimAsColourCatalogByAllowlist({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (args: Record<string, unknown>) => Promise<{ data?: ProductRow[] }>
  }

  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: { status?: string }) => Promise<unknown>
  }

  const apply = getApplyFlag(args ?? [])

  const csvPath = resolveExistingPath(DEFAULT_ALLOWLIST_CSV_CANDIDATES, "AS Colour allowlist CSV")
  const rawCsv = fs.readFileSync(csvPath, "utf-8")
  const rows = parseCsv(rawCsv)

  const allowedStyleCodes = new Set<string>()
  for (const row of rows) {
    const code = normalizeStyleCode(row["STYLECODE"])
    if (code) {
      allowedStyleCodes.add(code)
    }
  }

  if (!allowedStyleCodes.size) {
    throw new Error("No STYLECODE values found in allowlist CSV")
  }

  logger.info(
    `Loaded ${allowedStyleCodes.size} unique STYLECODE(s) from ${csvPath} (${rows.length} data rows)`
  )

  const asColourProducts: ProductRow[] = []
  let offset = 0

  while (true) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "status"],
      pagination: {
        take: PAGE_SIZE,
        skip: offset,
      },
    })

    const batch = page ?? []
    if (!batch.length) {
      break
    }

    for (const p of batch) {
      const h = p.handle
      if (typeof h === "string" && (h === "as-colour" || h.startsWith("as-colour-"))) {
        asColourProducts.push(p)
      }
    }

    offset += PAGE_SIZE
  }

  logger.info(
    `Found ${asColourProducts.length} product(s) with handle as-colour / as-colour-*.`
  )

  let wouldPublish = 0
  let wouldDraft = 0
  let unchanged = 0
  let skippedEmptyStyle = 0
  const emptyStyleWarnings: string[] = []
  const dryRunSample: string[] = []

  for (const product of asColourProducts) {
    const handle = product.handle ?? ""
    const styleCode = normalizeStyleCode(extractStyleCodeFromHandle(handle))
    if (!styleCode) {
      skippedEmptyStyle++
      if (emptyStyleWarnings.length < 25) {
        emptyStyleWarnings.push(`${product.id} handle=${handle || "?"}`)
      }
      continue
    }

    const inList = allowedStyleCodes.has(styleCode)
    const targetStatus = inList ? ProductStatus.PUBLISHED : ProductStatus.DRAFT
    const current = (product.status ?? "").toLowerCase()
    const targetLower = String(targetStatus).toLowerCase()

    if (current === targetLower) {
      unchanged++
      continue
    }

    if (inList) {
      wouldPublish++
    } else {
      wouldDraft++
    }

    if (!apply && dryRunSample.length < 30) {
      dryRunSample.push(
        `${targetStatus} <- ${current || "?"}  ${handle}  (style ${styleCode})`
      )
    }

    if (apply) {
      await productModule.updateProducts(product.id, { status: targetStatus })
    }
  }

  logger.info(
    `Summary: apply=${apply} publish=${wouldPublish} draft=${wouldDraft} unchanged=${unchanged} empty_style=${skippedEmptyStyle}`
  )

  if (emptyStyleWarnings.length) {
    logger.warn(
      `Could not extract STYLECODE from handle (last segment empty after normalize) — ${emptyStyleWarnings.length} product(s), samples:`
    )
    for (const w of emptyStyleWarnings.slice(0, 10)) {
      logger.warn(`  ${w}`)
    }
  }

  if (!apply && (wouldPublish > 0 || wouldDraft > 0)) {
    logger.info("Dry run sample (first 30 updates that would be applied):")
    for (const line of dryRunSample) {
      logger.info(`  ${line}`)
    }
    logger.info("Re-run with --apply or AS_COLOUR_CATALOG_TRIM_APPLY=1 to persist.")
  }

  if (apply) {
    logger.info(
      "Post-run: if Meilisearch is enabled, reindex products or wait for sync. Invalidate storefront caches if needed."
    )
  }
}
