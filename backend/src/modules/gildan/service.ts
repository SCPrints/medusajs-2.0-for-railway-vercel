import type { Logger } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import * as XLSX from "xlsx"
import fs from "node:fs"
import {
  groupRowsByStyle,
  parseGildanRow,
} from "./mapping"
import type { GildanProduct, GildanRow } from "./types"

type InjectedDependencies = {
  logger: Logger
}

export type GildanOptions = {
  /**
   * Multiplier applied to Gildan's Classic-tier supplier cost before it
   * feeds into the bulk-price ladder. Default 1.0 — ingest the column
   * as-is. Production may need adjustment after staff cross-checks the
   * first invoice.
   */
  cost_adjustment?: number
  /**
   * Default absolute path to the xlsx file. Optional — admin upload sets
   * the path per-import. Useful for CLI runs without the admin UI.
   */
  xlsx_path?: string | null
  /**
   * Disk cache directory for the image scraper. When unset, the scraper
   * defaults to /tmp/gildan-image-cache.
   */
  image_scrape_cache_dir?: string | null
}

/**
 * Gildan supplier module — thin, no API client (the source is a static
 * file, not an API). Owns:
 *   - The xlsx file reader (one entry point so the importer + admin
 *     route + a future stock-update flow all parse the file the same way)
 *   - The cost-adjustment knob (one place to clamp + log)
 *   - The handle map between Gildan brand names and Medusa Brand
 *     entities (re-exported from types.ts via the module index)
 *
 * Keeps the same surface shape as FashionBizService so the importer
 * script reads similarly.
 */
export default class GildanService {
  static identifier = "gildan"
  protected options_: GildanOptions
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies, options: GildanOptions = {}) {
    this.options_ = options ?? {}
    this.logger_ = logger
  }

  static validateOptions(options: Record<string, any> = {}) {
    // No required options — the module is happy to load with defaults.
    // xlsx_path can be set per-import via the admin upload, so it's not
    // mandatory at module-load time.
    if (
      options &&
      options.cost_adjustment !== undefined &&
      options.cost_adjustment !== null
    ) {
      const n = Number(options.cost_adjustment)
      if (!Number.isFinite(n) || n <= 0) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Gildan module: cost_adjustment must be a positive number, got ${options.cost_adjustment}`
        )
      }
    }
  }

  getOptions(): GildanOptions {
    return this.options_
  }

  /**
   * Clamped to a positive finite number. Defends against env-var typos
   * that would otherwise zero out every price.
   */
  getCostAdjustment(): number {
    const raw = this.options_.cost_adjustment
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return 1.0
    return raw
  }

  /**
   * Parse the Gildan xlsx file at the given absolute path. Returns the
   * raw parsed `GildanRow`s plus aggregation warnings (cross-row drift
   * detection). Does NOT group — call `groupRowsByStyle` separately if
   * needed.
   */
  parseXlsxFile(absPath: string): {
    rows: GildanRow[]
    dropped: number
  } {
    if (!fs.existsSync(absPath)) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Gildan xlsx file not found: ${absPath}`
      )
    }
    const wb = XLSX.readFile(absPath, { type: "file", cellDates: false })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Gildan xlsx file has no sheets: ${absPath}`
      )
    }
    const ws = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    })
    // First row is the header — skip it.
    const dataRows = raw.slice(1)
    const rows: GildanRow[] = []
    let dropped = 0
    for (const r of dataRows) {
      const parsed = parseGildanRow(r)
      if (parsed) rows.push(parsed)
      else dropped++
    }
    return { rows, dropped }
  }

  /**
   * Convenience: parse + group in one. Returns the list of grouped
   * products + the per-group drift warnings.
   */
  parseAndGroup(absPath: string): {
    products: GildanProduct[]
    rowsParsed: number
    rowsDropped: number
    warnings: string[]
  } {
    const { rows, dropped } = this.parseXlsxFile(absPath)
    const warnings: string[] = []
    const products = groupRowsByStyle(rows, warnings)
    return {
      products,
      rowsParsed: rows.length,
      rowsDropped: dropped,
      warnings,
    }
  }
}
