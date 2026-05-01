import type { ParsedCsv } from "./csv-import"
import { PRODUCT_IMPORT_CSV_HEADERS } from "./product-import-template-csv"
import {
  deriveTierMinorFromSpreadsheet100PlusAnchor,
  parseMoneyToMinor,
  type TierMoneyMinor,
} from "./spreadsheet-money"

/** URL-safe handle from a collection title (Medusa product collection `handle`). */
export function slugifyCollectionHandle(title: string): string {
  const s = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
  return s || "collection"
}

/**
 * Stamp `product collection id` on each row so batch create assigns products to that collection.
 * When `onlyIfEmpty` is true (default), rows that already have a collection id keep it.
 */
export function applyDefaultCollectionIdToParsedCsv(
  parsed: ParsedCsv,
  collectionId: string,
  opts?: { onlyIfEmpty?: boolean }
): ParsedCsv {
  const id = collectionId.trim()
  if (!id) {
    return parsed
  }
  const onlyIfEmpty = opts?.onlyIfEmpty !== false
  return {
    ...parsed,
    rows: parsed.rows.map((row) => {
      const cur = (row["product collection id"] ?? "").trim()
      if (onlyIfEmpty && cur) {
        return row
      }
      return { ...row, "product collection id": id }
    }),
  }
}

export function normalizeSpreadsheetHeaderKey(key: string): string {
  return key
    .replace(/^\ufeff/g, "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
}

/**
 * Read first non-empty cell where column header matches any alias (spacing / underscore tolerant).
 */
export function getCellAliased(row: Record<string, string>, aliases: string[]): string {
  const normToActual = new Map<string, string>()
  for (const rk of Object.keys(row)) {
    normToActual.set(normalizeSpreadsheetHeaderKey(rk), rk)
  }
  for (const alias of aliases) {
    const nk = normalizeSpreadsheetHeaderKey(alias)
    const actual = normToActual.get(nk)
    if (actual !== undefined) {
      const v = (row[actual] ?? "").trim()
      if (v) {
        return v
      }
    }
  }
  return ""
}

/** Maps normalized synonym → canonical import-template header key (lowercase). */
function buildSynonymToCanonical(): Map<string, string> {
  const m = new Map<string, string>()
  const pairs: [string, string[]][] = [
    ["product handle", ["handle", "slug", "product slug"]],
    ["product title", ["title", "product name", "name"]],
    [
      "variant sku",
      ["sku", "stock keeping unit", "product code", "productcode"],
    ],
  ]
  for (const [canonical, syns] of pairs) {
    m.set(normalizeSpreadsheetHeaderKey(canonical), canonical)
    for (const s of syns) {
      m.set(normalizeSpreadsheetHeaderKey(s), canonical)
    }
  }
  return m
}

let synonymLookup: Map<string, string> | null = null
function getSynonymLookup(): Map<string, string> {
  synonymLookup ??= buildSynonymToCanonical()
  return synonymLookup
}

/**
 * Remap known synonyms onto Medusa template header names (e.g. `handle` → `product handle`).
 */
export function applySpreadsheetHeaderAliases(parsed: ParsedCsv): ParsedCsv {
  const lookup = getSynonymLookup()
  const headerOldToNew = new Map<string, string>()
  for (const h of parsed.headers) {
    const nk = normalizeSpreadsheetHeaderKey(h)
    headerOldToNew.set(h, lookup.get(nk) ?? h)
  }

  const newHeaders = [...new Set(parsed.headers.map((h) => headerOldToNew.get(h) ?? h))]

  const rows = parsed.rows.map((row) => {
    const out: Record<string, string> = {}
    for (const nh of newHeaders) {
      out[nh] = ""
    }
    for (const h of parsed.headers) {
      const target = headerOldToNew.get(h) ?? h
      const val = (row[h] ?? "").trim()
      if (!val) {
        continue
      }
      const prev = (out[target] ?? "").trim()
      if (!prev) {
        out[target] = val
      }
    }
    return out
  })

  return { headers: newHeaders, rows }
}

/** True if the column exists and at least one row has a non-empty value (handles BOM/spacing case variants). */
function columnFilledSomewhere(parsed: ParsedCsv, canonicalHeader: string): boolean {
  const target = normalizeSpreadsheetHeaderKey(canonicalHeader)
  const hk = parsed.headers.find((h) => normalizeSpreadsheetHeaderKey(h) === target)
  if (!hk) {
    return false
  }
  return parsed.rows.some((r) => !!(r[hk] ?? "").trim())
}

function normalizedHeaderKeySet(parsed: ParsedCsv): Set<string> {
  return new Set(parsed.headers.map((h) => normalizeSpreadsheetHeaderKey(h)))
}

function setHasAnyKey(keys: Set<string>, candidates: readonly string[]): boolean {
  return candidates.some((c) => keys.has(c))
}

/**
 * Wholesale / ERP / stock feeds (FashionBiz, Syzmik, generic stock exports): normalized header tokens.
 * Used for detection and for reading cells (via getCellAliased aliases).
 */
const VARIANT_GRID_SKU_HEADERS = [
  "sku",
  "variant sku",
  "barcode",
  "item sku",
  "stock code",
  "stock item",
  "stock sku",
  "item code",
  "item number",
  "item no",
  "variant code",
  "article",
  "article number",
  "article code",
  "product sku",
] as const

const VARIANT_GRID_STYLE_HEADERS = [
  "style code",
  "stylecode",
  "style",
  "stock style",
  "item style",
  "model code",
  "model number",
  "model no",
  "model",
  "master sku",
  "parent sku",
  "catalog code",
  "range code",
  "product code",
  "style ref",
  "style reference",
  "master code",
  "master style",
  "article parent",
] as const

const VARIANT_GRID_SIZE_HEADERS = [
  "size",
  "sizes",
  "size code",
  "sz",
  "waist",
  "inseam",
] as const

const VARIANT_GRID_COLOUR_HEADERS = [
  "colour",
  "color",
  "clr",
  "colourway",
  "colorway",
  "shade",
  "finish",
  "colour description",
  "color description",
] as const

/** Wholesale price columns — biz-collection / FashionBiz naming varies widely per supplier export. */
const VARIANT_GRID_PRICE_HEADERS = [
  "price",
  "price1",
  "price 1",
  "price2",
  "price 2",
  "sell_price",
  "sell price",
  "aud_price",
  "aud price",
  "unit_price",
  "unit price",
  "trade_price",
  "trade price",
  "variant price aud",
  "list price",
  "sell price inc gst",
  "sell price ex gst",
  "rrp",
  "recommended retail",
  "recommended retail price",
  "your price",
  "trade",
  "nett",
  "nett price",
  "each",
  "buy price",
  "buy",
  "web price",
  "unit sell",
  "unit sell price",
  "sell",
  "wholesale price",
  "cost price",
  "cost",
  "dealer price",
  "gst exclusive",
  "price ex gst",
  "price inc gst",
  "inc gst",
  "ex gst",
  "sell aud",
  "aud sell",
] as const

function fashionBizPriceFromRow(row: Record<string, string>): string {
  const direct = getCellAliased(row, [...VARIANT_GRID_PRICE_HEADERS])
  if (direct) {
    return direct
  }
  /** Supplier-specific headers (e.g. "Sell AUD", "Trade inc GST") not listed above — infer by name + parseable money. */
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeSpreadsheetHeaderKey(k)
    if (!nk) {
      continue
    }
    if (
      nk.includes("freight") ||
      nk.includes("weight") ||
      nk.includes("quantity") ||
      nk.includes("qty") ||
      nk.includes("box qty") ||
      (nk.includes("cost") && !nk.includes("price") && !nk.includes("sell"))
    ) {
      continue
    }
    if (!fashionBizHeaderLooksLikePriceColumn(nk)) {
      continue
    }
    const val = (v ?? "").trim()
    if (!val || parseMoneyToMinor(val) === null) {
      continue
    }
    return val
  }
  return ""
}

/** True when normalized CSV header plausibly denotes a unit sell price column (not SKU/style/etc.). */
function fashionBizHeaderLooksLikePriceColumn(nk: string): boolean {
  if (nk.includes("rrp")) {
    return true
  }
  if (/(^|\s)(price|pricing)(\s|$)/.test(nk)) {
    return true
  }
  if (nk.includes("nett") || nk.includes("trade") || nk.includes("wholesale") || nk.includes("retail")) {
    return true
  }
  if (nk.includes("srp") || nk.includes("msrp")) {
    return true
  }
  if (nk.includes("sell") || nk.includes("list")) {
    return true
  }
  if (nk.includes("each")) {
    return true
  }
  if ((nk.includes("aud") || nk.includes("gst")) && (nk.includes("sell") || nk.includes("trade") || nk.includes("unit"))) {
    return true
  }
  if (nk.endsWith(" aud") || nk.startsWith("aud ") || nk.includes(" aud ")) {
    return true
  }
  return false
}

/**
 * AS Colour / wholesale feeds: STYLECODE + PRODUCT_NAME (+ PRICE), no Medusa template columns.
 */
export function detectGoldCatalogFormat(parsed: ParsedCsv): boolean {
  const keys = new Set(parsed.headers.map((h) => normalizeSpreadsheetHeaderKey(h)))
  const hasGoldCols = keys.has("stylecode") && keys.has("product name")
  /** Wholesale grids often ship an empty "Product Handle" column — still treat as non-template until filled. */
  const noMedusaHandle = !columnFilledSomewhere(parsed, "product handle")
  return hasGoldCols && noMedusaHandle
}

/**
 * FashionBiz / biz-collection / Syzmik / stock-item variant grids: sku + style + size + colour (no Medusa template).
 * Must run before `applySpreadsheetHeaderAliases` so `sku` is not remapped to `variant sku`.
 */
export function detectFashionBizVariantCatalog(parsed: ParsedCsv): boolean {
  const keys = normalizedHeaderKeySet(parsed)
  /** Same empty-column caveat as gold detection. */
  const noMedusaHandle = !columnFilledSomewhere(parsed, "product handle")

  const hasSku = setHasAnyKey(keys, VARIANT_GRID_SKU_HEADERS)
  const hasStyle = setHasAnyKey(keys, VARIANT_GRID_STYLE_HEADERS)
  const hasSize = setHasAnyKey(keys, VARIANT_GRID_SIZE_HEADERS)
  const hasColour = setHasAnyKey(keys, VARIANT_GRID_COLOUR_HEADERS)

  return noMedusaHandle && hasSku && hasStyle && hasSize && hasColour
}

function slugBizCollectionHandle(styleCodeRaw: string): string {
  const s = styleCodeRaw.trim().toUpperCase()
  const slug = `biz-collection-${s.toLowerCase()}`
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return (slug || "biz-collection-product").slice(0, 120)
}

/**
 * One Medusa row per variant line; grouped by style → single product with Size + Colour options.
 */
export function expandFashionBizCatalogToTemplate(parsed: ParsedCsv, shippingProfileId: string): ParsedCsv {
  const headersBase = PRODUCT_IMPORT_CSV_HEADERS.map((h) => h.toLowerCase())
  const extra = ["variant option 2 name", "variant option 2 value"]
  const headers = [...headersBase]
  for (const e of extra) {
    if (!headers.includes(e)) {
      headers.push(e)
    }
  }

  const byStyle = new Map<string, Record<string, string>[]>()
  for (const row of parsed.rows) {
    const st = getCellAliased(row, [...VARIANT_GRID_STYLE_HEADERS])
      .trim()
      .toUpperCase()
    if (!st) {
      continue
    }
    const list = byStyle.get(st)
    if (list) {
      list.push(row)
    } else {
      byStyle.set(st, [row])
    }
  }

  const rowsOut: Record<string, string>[] = []

  for (const groupRows of byStyle.values()) {
    const first = groupRows[0]!
    const styleDisplay = getCellAliased(first, [...VARIANT_GRID_STYLE_HEADERS]).trim()
    const handle = slugBizCollectionHandle(styleDisplay)
    const productTitle =
      getCellAliased(first, [
        "product_name",
        "product name",
        "style_name",
        "style name",
        "name",
        "description",
        "product",
      ]) || `Biz Collection ${styleDisplay}`

    const thumb =
      getCellAliased(first, ["image_url", "thumbnail", "product_url", "product url", "product image 1 url"]) ||
      ""

    let stylePriceFallback = ""
    for (const row of groupRows) {
      const p = fashionBizPriceFromRow(row)
      if (p) {
        stylePriceFallback = p
        break
      }
    }

    for (const row of groupRows) {
      const sku = getCellAliased(row, [...VARIANT_GRID_SKU_HEADERS])
      const size = getCellAliased(row, [...VARIANT_GRID_SIZE_HEADERS])
      const colour = getCellAliased(row, [...VARIANT_GRID_COLOUR_HEADERS])
      let price = fashionBizPriceFromRow(row)
      if (!price) {
        price = stylePriceFallback
      }

      const base = emptyTemplateRow()
      base["variant option 2 name"] = ""
      base["variant option 2 value"] = ""

      base["product handle"] = handle
      base["product title"] = productTitle
      base["product status"] = "published"
      base["product discountable"] = "TRUE"
      base["shipping profile id"] = shippingProfileId
      base["variant sku"] = sku
      base["variant title"] = [size, colour].filter(Boolean).join(" / ") || sku
      base["variant price aud"] = price
      base["variant manage inventory"] = "FALSE"
      base["variant allow backorder"] = "TRUE"
      base["variant option 1 name"] = "Size"
      base["variant option 1 value"] = size || "One Size"
      base["variant option 2 name"] = "Colour"
      base["variant option 2 value"] = colour || "Default"
      if (thumb) {
        base["product thumbnail"] = thumb
        base["product image 1 url"] = thumb
      }

      rowsOut.push(base)
    }
  }

  return { headers, rows: rowsOut }
}

function emptyTemplateRow(): Record<string, string> {
  const r: Record<string, string> = {}
  for (const h of PRODUCT_IMPORT_CSV_HEADERS) {
    r[h.toLowerCase()] = ""
  }
  return r
}

function slugHandleFromStyleCode(styleCode: string): string {
  const s = styleCode.trim()
  const slug = `ascolour-${s}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return (slug || "product").slice(0, 120)
}

/**
 * One Medusa row per catalog line; STYLECODE → handle `ascolour-<code>` + single default variant.
 */
export function expandGoldCatalogToTemplate(parsed: ParsedCsv, shippingProfileId: string): ParsedCsv {
  const headers = PRODUCT_IMPORT_CSV_HEADERS.map((h) => h.toLowerCase())
  const rowsOut: Record<string, string>[] = []
  const seen = new Set<string>()

  for (const row of parsed.rows) {
    const style = (row["stylecode"] ?? "").trim()
    if (!style) {
      continue
    }
    const key = style.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    const title = (row["product_name"] ?? row["product name"] ?? "").trim() || style
    const price = (row["price"] ?? "").trim()
    const productUrl =
      (row["product url"] ?? row["product_url"] ?? row["producturl"] ?? "").trim()

    const base = emptyTemplateRow()
    base["product handle"] = slugHandleFromStyleCode(style)
    base["product title"] = title
    base["product status"] = "published"
    base["product discountable"] = "TRUE"
    base["shipping profile id"] = shippingProfileId
    base["variant sku"] = style
    base["variant title"] = title
    base["variant price aud"] = price
    base["variant manage inventory"] = "FALSE"
    base["variant allow backorder"] = "TRUE"
    base["variant option 1 name"] = "Style"
    base["variant option 1 value"] = style
    if (productUrl) {
      base["product thumbnail"] = productUrl
      base["product image 1 url"] = productUrl
    }

    rowsOut.push(base)
  }

  return { headers, rows: rowsOut }
}

function slugDncHandle(styleCodeRaw: string): string {
  const slug = `dnc-${styleCodeRaw.trim().toLowerCase()}`
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return (slug || "dnc-product").slice(0, 120)
}

/** DNC listing row: grouped style line with colour/size/barcodes empty. */
export function isDncStyleSummaryRow(row: Record<string, string>): boolean {
  const d2 = (row["description2"] ?? "").trim()
  const d3 = (row["description3"] ?? "").trim()
  const bc = (row["barcode"] ?? "").trim()
  return !d2 && !d3 && !bc
}

/**
 * DNC Workwear price exports: parent row (style ProductCode + Description title), then SKU rows with
 * Description2=colour, Description3=size, URLs on dncworkwear.com.au.
 */
export function detectDncWorkwearCatalog(parsed: ParsedCsv): boolean {
  const keys = normalizedHeaderKeySet(parsed)
  const hasShape =
    keys.has("productcode") &&
    keys.has("description") &&
    keys.has("description2") &&
    keys.has("description3") &&
    keys.has("url") &&
    keys.has("image")
  const noMedusaHandle = !columnFilledSomewhere(parsed, "product handle")
  if (!hasShape || !noMedusaHandle) {
    return false
  }

  const cap = Math.min(parsed.rows.length, 48)
  for (let i = 0; i < cap; i++) {
    const row = parsed.rows[i]!
    const blob = `${row["url"] ?? ""}${row["image"] ?? ""}`.toLowerCase()
    if (blob.includes("dncworkwear")) {
      return true
    }
  }
  return false
}

/**
 * One Medusa row per DNC variant SKU; parent summary row sets handle/title until the next summary row.
 */
export function expandDncWorkwearCatalogToTemplate(
  parsed: ParsedCsv,
  shippingProfileId: string
): ParsedCsv {
  const headersBase = PRODUCT_IMPORT_CSV_HEADERS.map((h) => h.toLowerCase())
  const extra = ["variant option 2 name", "variant option 2 value"]
  const headers = [...headersBase]
  for (const e of extra) {
    if (!headers.includes(e)) {
      headers.push(e)
    }
  }

  const rowsOut: Record<string, string>[] = []
  let parentStyle: string | null = null
  let parentTitle = ""
  let stylePriceFallback = ""

  for (const row of parsed.rows) {
    const code = (row["productcode"] ?? "").trim()
    if (!code) {
      continue
    }

    if (isDncStyleSummaryRow(row)) {
      parentStyle = code
      parentTitle = (row["description"] ?? "").trim()
      const p = fashionBizPriceFromRow(row)
      if (p) {
        stylePriceFallback = p
      }
      continue
    }

    if (!parentStyle) {
      continue
    }

    const colour = (row["description2"] ?? "").trim()
    const size = (row["description3"] ?? "").trim()

    let price = fashionBizPriceFromRow(row)
    if (!price) {
      price = stylePriceFallback
    }

    const thumb = (row["image"] ?? "").trim()
    const lineTitle = (row["description"] ?? "").trim()

    const base = emptyTemplateRow()
    base["variant option 2 name"] = ""
    base["variant option 2 value"] = ""

    base["product handle"] = slugDncHandle(parentStyle)
    base["product title"] = parentTitle || lineTitle || parentStyle
    base["product status"] = "published"
    base["product discountable"] = "TRUE"
    base["shipping profile id"] = shippingProfileId
    base["variant sku"] = code
    base["variant title"] = lineTitle || [size, colour].filter(Boolean).join(" / ") || code
    base["variant price aud"] = price
    base["variant manage inventory"] = "FALSE"
    base["variant allow backorder"] = "TRUE"
    base["variant option 1 name"] = "Size"
    base["variant option 1 value"] = size || "One Size"
    base["variant option 2 name"] = "Colour"
    base["variant option 2 value"] = colour || "Default"

    const bar = (row["barcode"] ?? "").trim()
    if (bar) {
      base["variant barcode"] = bar
    }
    if (thumb) {
      base["product thumbnail"] = thumb
      base["product image 1 url"] = thumb
    }

    rowsOut.push(base)
  }

  return { headers, rows: rowsOut }
}

export type SpreadsheetImportOptions = {
  /** Required for AS Colour–style CSVs that omit Shipping Profile Id. */
  defaultShippingProfileId?: string
}

export type NormalizeSpreadsheetResult = {
  /** Passes validation and can be sent to `buildBatchCreatesFromParsedCsv`; null until requirements are met */
  readyParsed: ParsedCsv | null
  rawParsed: ParsedCsv
  hints: string[]
}

export function normalizeSpreadsheetForImport(
  rawParsed: ParsedCsv,
  opts: SpreadsheetImportOptions
): NormalizeSpreadsheetResult {
  const hints: string[] = []

  if (detectFashionBizVariantCatalog(rawParsed)) {
    const sp = opts.defaultShippingProfileId?.trim()
    if (!sp) {
      hints.push(
        "Detected wholesale variant-grid CSV (e.g. sku / stock item + style + size + colour). Paste **Default shipping profile id** below (Settings → Shipping Profiles), then re-upload or change the field to refresh preview."
      )
      return { readyParsed: null, rawParsed, hints }
    }
    const expanded = expandFashionBizCatalogToTemplate(rawParsed, sp)
    const distinctHandles = new Set(expanded.rows.map((r) => (r["product handle"] ?? "").trim())).size
    hints.push(
      `Mapped ${expanded.rows.length} variant row(s) from FashionBiz columns (${distinctHandles} product handle(s), pattern \`biz-collection-<style>\`).`
    )
    return { readyParsed: expanded, rawParsed, hints }
  }

  if (detectGoldCatalogFormat(rawParsed)) {
    const sp = opts.defaultShippingProfileId?.trim()
    if (!sp) {
      hints.push(
        "Detected AS Colour wholesale columns (STYLECODE, PRODUCT_NAME). Paste a **Shipping profile id** below (Settings → Shipping Profiles), then the preview will validate."
      )
      return { readyParsed: null, rawParsed, hints }
    }
    const expanded = expandGoldCatalogToTemplate(rawParsed, sp)
    hints.push(
      `Mapped ${expanded.rows.length} unique STYLECODE row(s) to Medusa products (handle pattern \`ascolour-<stylecode>\`).`
    )
    return { readyParsed: expanded, rawParsed, hints }
  }

  if (detectDncWorkwearCatalog(rawParsed)) {
    const sp = opts.defaultShippingProfileId?.trim()
    if (!sp) {
      hints.push(
        "Detected DNC Workwear price CSV (ProductCode / Description / Description2–3 / URL). Paste **Default shipping profile id** below (Settings → Shipping Profiles), then re-upload or change the field to refresh preview."
      )
      return { readyParsed: null, rawParsed, hints }
    }
    const expanded = expandDncWorkwearCatalogToTemplate(rawParsed, sp)
    const distinctHandles = new Set(expanded.rows.map((r) => (r["product handle"] ?? "").trim())).size
    hints.push(
      `Mapped ${expanded.rows.length} variant row(s) from DNC Workwear (${distinctHandles} product handle(s), pattern \`dnc-<stylecode>\`).`
    )
    return { readyParsed: expanded, rawParsed, hints }
  }

  const aliased = applySpreadsheetHeaderAliases(rawParsed)
  const err = validateHeaders(aliased)
  if (err) {
    hints.push(err)
    return { readyParsed: null, rawParsed, hints }
  }

  return { readyParsed: aliased, rawParsed, hints: [] }
}

type ProductCreateStatus = "draft" | "published" | "proposed" | "rejected"

type VariantPrice = { amount: number; currency_code: string }

/** Payload accepted by `sdk.admin.product.batch({ create })` — typed loosely for batch compatibility. */
export type SpreadsheetProductCreate = Record<string, unknown>

export const REQUIRED_HEADERS = ["product handle", "product title", "variant sku"] as const

const TRUEISH = (raw: string): boolean => {
  const v = raw.trim().toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}

const normalizeStatus = (raw: string | undefined): ProductCreateStatus => {
  const s = (raw ?? "").trim().toLowerCase()
  if (s === "draft" || s === "published" || s === "proposed" || s === "rejected") {
    return s
  }
  return "draft"
}

/**
 * True when any tier supplemental column is non-empty (user intends tier ladder).
 */
export const tierColumnsPartiallyFilled = (row: Record<string, string>): boolean => {
  const keys = [
    "base_sale_price",
    "tier_10_to_19_price",
    "tier_10_to_49_price",
    "tier_20_to_49_price",
    "tier_50_to_99_price",
    "tier_100_plus_price",
  ] as const
  return keys.some((k) => !!(row[k] ?? "").trim())
}

/**
 * Parse tier amounts from CSV supplemental columns (major units → minor). Prefer explicit split columns for 10–19 vs 20–49 when present.
 */
export const parseTierMinorFromRow = (
  row: Record<string, string>,
  rowLabel: string
): { tiers: TierMoneyMinor } | { error: string } => {
  const base = parseMoneyToMinor(row["base_sale_price"])
  const t1019Explicit = parseMoneyToMinor(row["tier_10_to_19_price"])
  const t2049Explicit = parseMoneyToMinor(row["tier_20_to_49_price"])
  const t1049Legacy = parseMoneyToMinor(row["tier_10_to_49_price"])
  const t50 = parseMoneyToMinor(row["tier_50_to_99_price"])
  const t100 = parseMoneyToMinor(row["tier_100_plus_price"])

  let t10_19: number
  let t20_49: number

  if (t1019Explicit !== null && t2049Explicit !== null) {
    t10_19 = t1019Explicit
    t20_49 = t2049Explicit
  } else if (t1049Legacy !== null) {
    t10_19 = t1049Legacy
    t20_49 = t1049Legacy
  } else {
    return {
      error: `${rowLabel}: tier pricing requires BASE_SALE_PRICE, TIER_50_TO_99_PRICE, TIER_100_PLUS_PRICE, and either TIER_10_TO_19_PRICE + TIER_20_TO_49_PRICE or legacy TIER_10_TO_49_PRICE.`,
    }
  }

  if (base === null || t50 === null || t100 === null) {
    return {
      error: `${rowLabel}: tier pricing requires BASE_SALE_PRICE, TIER_50_TO_99_PRICE, TIER_100_PLUS_PRICE, and either TIER_10_TO_19_PRICE + TIER_20_TO_49_PRICE or legacy TIER_10_TO_49_PRICE.`,
    }
  }

  return {
    tiers: {
      t1_9: base,
      t10_19,
      t20_49,
      t50_99: t50,
      t100_plus: t100,
    },
  }
}

/** Spreadsheet sync targets AUD only (store regions/currencies). EUR/USD columns in the template are ignored here. */
const variantPricesFromRow = (
  row: Record<string, string>,
  tierHint: TierMoneyMinor | undefined
): VariantPrice[] => {
  const prices: VariantPrice[] = []
  const audFlat = parseMoneyToMinor(row["variant price aud"])

  if (tierHint) {
    prices.push({ amount: tierHint.t1_9, currency_code: "aud" })
  } else if (audFlat !== null) {
    prices.push({ amount: audFlat, currency_code: "aud" })
  }

  return prices
}

export type VariantPricingResolution =
  | { ok: false; error: string }
  | {
      ok: true
      tierHint: TierMoneyMinor | undefined
      /** Rows that contribute to preview “tier pricing rules” (explicit tiers or AUD anchor ladder). */
      countsTowardTierRulePreview: boolean
    }

/**
 * Single source of truth for per-variant pricing checks used by preview and `buildBatchCreatesFromParsedCsv`.
 */
export const resolveVariantRowPricing = (
  row: Record<string, string>,
  rowLabel: string
): VariantPricingResolution => {
  const audFlat = parseMoneyToMinor(row["variant price aud"])
  let tierHint: TierMoneyMinor | undefined

  if (tierColumnsPartiallyFilled(row)) {
    const parsedTier = parseTierMinorFromRow(row, rowLabel)
    if ("error" in parsedTier) {
      return { ok: false, error: parsedTier.error }
    }
    tierHint = parsedTier.tiers
  } else if (audFlat !== null && audFlat > 0) {
    tierHint = deriveTierMinorFromSpreadsheet100PlusAnchor(audFlat)
  }

  const prices = variantPricesFromRow(row, tierHint)
  if (!prices.length) {
    return {
      ok: false,
      error: `${rowLabel}: set Variant Price AUD, or supplemental tier columns for the AUD ladder.`,
    }
  }

  const countsTowardTierRulePreview =
    tierColumnsPartiallyFilled(row) || (audFlat !== null && audFlat > 0)

  return { ok: true, tierHint, countsTowardTierRulePreview }
}

export type SpreadsheetPreview = {
  productCount: number
  variantCount: number
  tierRuleCount: number
  validationErrors: string[]
}

export const validateHeaders = (parsed: ParsedCsv): string | null => {
  const headers = new Set(parsed.headers)
  for (const h of REQUIRED_HEADERS) {
    if (!headers.has(h)) {
      return `Missing required column "${h}". Use the export template columns (see Products → export widget).`
    }
  }
  return null
}

export const computeSpreadsheetPreview = (parsed: ParsedCsv): SpreadsheetPreview => {
  const validationErrors: string[] = []
  const headerErr = validateHeaders(parsed)
  if (headerErr) {
    validationErrors.push(headerErr)
  }

  const handles = new Set<string>()
  let tierRules = 0

  parsed.rows.forEach((row, idx) => {
    const rowLabel = `Row ${idx + 2}`
    const handle = (row["product handle"] ?? "").trim()
    const sku = (row["variant sku"] ?? "").trim()
    if (!handle) {
      validationErrors.push(`${rowLabel}: missing Product Handle`)
      return
    }
    if (!sku) {
      validationErrors.push(`${rowLabel}: missing Variant SKU`)
      return
    }
    handles.add(handle)

    const pricing = resolveVariantRowPricing(row, rowLabel)
    if (!pricing.ok) {
      validationErrors.push(pricing.error)
      return
    }
    if (pricing.countsTowardTierRulePreview) {
      tierRules++
    }
  })

  return {
    productCount: handles.size,
    variantCount: parsed.rows.length,
    tierRuleCount: tierRules,
    validationErrors,
  }
}

type GroupedRows = Map<string, Record<string, string>[]>

const groupRowsByHandle = (rows: Record<string, string>[]): GroupedRows => {
  const map: GroupedRows = new Map()
  for (const row of rows) {
    const handle = (row["product handle"] ?? "").trim()
    if (!handle) {
      continue
    }
    const list = map.get(handle)
    if (list) {
      list.push(row)
    } else {
      map.set(handle, [row])
    }
  }
  return map
}

const parseManageInventory = (raw: string | undefined): boolean =>
  raw === undefined || raw === "" ? true : TRUEISH(raw)

const parseAllowBackorder = (raw: string | undefined): boolean =>
  raw !== undefined && raw !== "" ? TRUEISH(raw) : false

/** Max duplicate-barcode detail lines returned (rest summarized). */
const BARCODE_DEDUPE_WARNING_CAP = 40

export type BuildCreatesResult = {
  creates: SpreadsheetProductCreate[]
  tierBySku: Map<string, TierMoneyMinor>
  errors: string[]
  /** Human-readable warnings (e.g. duplicate barcodes stripped so sync can proceed). */
  warnings: string[]
}

export const buildBatchCreatesFromParsedCsv = (parsed: ParsedCsv): BuildCreatesResult => {
  const errors: string[] = []
  const barcodeDedupeDetails: string[] = []
  const tierBySku = new Map<string, TierMoneyMinor>()
  const seenBarcodes = new Set<string>()
  let barcodeDedupeCount = 0

  const headerErr = validateHeaders(parsed)
  if (headerErr) {
    errors.push(headerErr)
    return { creates: [], tierBySku, errors, warnings: [] }
  }

  const previewRun = computeSpreadsheetPreview(parsed)
  previewRun.validationErrors.forEach((e) => errors.push(e))
  if (previewRun.validationErrors.length > 0) {
    return { creates: [], tierBySku, errors, warnings: [] }
  }

  const grouped = groupRowsByHandle(parsed.rows)
  const creates: SpreadsheetProductCreate[] = []

  for (const [handle, rows] of grouped) {
    const first = rows[0]!
    const shippingProfileId = (first["shipping profile id"] ?? "").trim()
    if (!shippingProfileId) {
      errors.push(`Product "${handle}": Shipping Profile Id is required.`)
      continue
    }

    const salesChannelId = (first["product sales channel 1 id"] ?? "").trim()
    const sales_channels = salesChannelId ? [{ id: salesChannelId }] : undefined

    const optTitleRaw = (first["variant option 1 name"] ?? "").trim()
    const optionTitle = optTitleRaw || "Option"

    const opt2TitleRaw = (first["variant option 2 name"] ?? "").trim()

    const valueSet = new Set<string>()
    const valueSet2 = new Set<string>()
    for (const r of rows) {
      const v = (r["variant option 1 value"] ?? "").trim()
      if (v) {
        valueSet.add(v)
      }
      if (opt2TitleRaw) {
        const v2 = (r["variant option 2 value"] ?? "").trim()
        if (v2) {
          valueSet2.add(v2)
        }
      }
    }
    if (valueSet.size === 0) {
      valueSet.add("Default")
    }

    const options: Array<{ title: string; values: string[] }> = [
      { title: optionTitle, values: Array.from(valueSet) },
    ]
    if (opt2TitleRaw) {
      const vals2 = valueSet2.size ? Array.from(valueSet2) : ["Default"]
      options.push({ title: opt2TitleRaw, values: vals2 })
    }

    const images: Array<{ url: string }> = []
    const u1 = (first["product image 1 url"] ?? "").trim()
    const u2 = (first["product image 2 url"] ?? "").trim()
    if (u1) {
      images.push({ url: u1 })
    }
    if (u2) {
      images.push({ url: u2 })
    }

    const variants: Record<string, unknown>[] = []

    rows.forEach((row, i) => {
      const rowLabel = `Product "${handle}" row ${i + 1}`
      const sku = (row["variant sku"] ?? "").trim()
      if (!sku) {
        errors.push(`${rowLabel}: Variant SKU is required`)
        return
      }

      const pricing = resolveVariantRowPricing(row, rowLabel)
      if (!pricing.ok) {
        errors.push(pricing.error)
        return
      }
      const { tierHint } = pricing
      if (tierHint) {
        tierBySku.set(sku, tierHint)
      }

      const optVal = (row["variant option 1 value"] ?? "").trim() || "Default"
      const optionsMap: Record<string, string> = { [optionTitle]: optVal }
      if (opt2TitleRaw) {
        const optVal2 = (row["variant option 2 value"] ?? "").trim() || "Default"
        optionsMap[opt2TitleRaw] = optVal2
      }

      const prices = variantPricesFromRow(row, tierHint)

      const weightRaw = (row["variant weight"] ?? "").trim()
      let weight: number | undefined
      if (weightRaw !== "") {
        const w = Number.parseInt(weightRaw, 10)
        if (Number.isFinite(w)) {
          weight = w
        }
      }

      const barcodeRaw = (row["variant barcode"] ?? "").trim()
      let barcode: string | undefined = barcodeRaw || undefined
      if (barcodeRaw) {
        if (seenBarcodes.has(barcodeRaw)) {
          barcodeDedupeCount++
          if (barcodeDedupeDetails.length < BARCODE_DEDUPE_WARNING_CAP) {
            barcodeDedupeDetails.push(
              `${rowLabel}: duplicate barcode "${barcodeRaw}" — omitted on this variant (SKU ${sku} still imported; first occurrence in file keeps barcode).`
            )
          }
          barcode = undefined
        } else {
          seenBarcodes.add(barcodeRaw)
        }
      }

      variants.push({
        title: (row["variant title"] ?? "").trim() || sku,
        sku,
        barcode,
        allow_backorder: parseAllowBackorder(row["variant allow backorder"]),
        manage_inventory: parseManageInventory(row["variant manage inventory"]),
        weight: weight !== undefined && Number.isFinite(weight) ? weight : undefined,
        hs_code: (row["variant hs code"] ?? "").trim() || undefined,
        origin_country: (row["variant origin country"] ?? "").trim() || undefined,
        mid_code: (row["variant mid code"] ?? "").trim() || undefined,
        material: (row["variant material"] ?? "").trim() || undefined,
        options: optionsMap,
        prices,
      })
    })

    if (!variants.length) {
      errors.push(`Product "${handle}": no valid variants — skipping product.`)
      continue
    }

    creates.push({
      title: (first["product title"] ?? "").trim() || handle,
      subtitle: (first["product subtitle"] ?? "").trim() || undefined,
      description: (first["product description"] ?? "").trim() || undefined,
      handle,
      status: normalizeStatus(first["product status"]),
      thumbnail: (first["product thumbnail"] ?? "").trim() || undefined,
      discountable:
        (first["product discountable"] ?? "").trim() === ""
          ? true
          : TRUEISH(first["product discountable"] ?? ""),
      external_id: (first["product external id"] ?? "").trim() || undefined,
      hs_code: (first["product hs code"] ?? "").trim() || undefined,
      origin_country: (first["product origin country"] ?? "").trim() || undefined,
      mid_code: (first["product mid code"] ?? "").trim() || undefined,
      material: (first["product material"] ?? "").trim() || undefined,
      weight: (() => {
        const raw = (first["product weight"] ?? "").trim()
        if (raw === "") {
          return undefined
        }
        const n = Number(first["product weight"])
        return Number.isFinite(n) ? n : undefined
      })(),
      shipping_profile_id: shippingProfileId,
      collection_id: (first["product collection id"] ?? "").trim() || undefined,
      type_id: (first["product type id"] ?? "").trim() || undefined,
      sales_channels,
      images: images.length ? images : undefined,
      options,
      variants,
    })
  }

  const warnings: string[] = []
  if (barcodeDedupeCount > 0) {
    warnings.push(
      `Stripped ${barcodeDedupeCount} duplicate barcode entr${barcodeDedupeCount === 1 ? "y" : "ies"} across the spreadsheet (Medusa barcode must be unique).`
    )
    warnings.push(...barcodeDedupeDetails)
    if (barcodeDedupeCount > BARCODE_DEDUPE_WARNING_CAP) {
      warnings.push(
        `…and ${barcodeDedupeCount - BARCODE_DEDUPE_WARNING_CAP} more duplicate barcode(s); barcodes omitted on those variants (SKUs unchanged).`
      )
    }
  }

  return { creates, tierBySku, errors, warnings }
}

export const PRODUCT_BATCH_CHUNK_SIZE = 10

export function chunkCreates<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
