import type { ParsedCsv } from "./csv-import"
import { PRODUCT_IMPORT_CSV_HEADERS } from "./product-import-template-csv"
import { parseMoneyToMinor, type TierMoneyMinor } from "./spreadsheet-money"

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

    for (const row of groupRows) {
      const sku = getCellAliased(row, [...VARIANT_GRID_SKU_HEADERS])
      const size = getCellAliased(row, [...VARIANT_GRID_SIZE_HEADERS])
      const colour = getCellAliased(row, [...VARIANT_GRID_COLOUR_HEADERS])
      const price = getCellAliased(row, [
        "price",
        "price1",
        "sell_price",
        "aud_price",
        "unit_price",
        "trade_price",
        "variant price aud",
        "unit price",
        "sell price",
        "list price",
        "rrp",
        "wholesale price",
        "cost price",
      ])

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
    "tier_10_to_49_price",
    "tier_50_to_99_price",
    "tier_100_plus_price",
  ] as const
  return keys.some((k) => !!(row[k] ?? "").trim())
}

/**
 * Parse four-band tier amounts from CSV (major units → minor). All four required when tier cols are used.
 */
export const parseTierMinorFromRow = (
  row: Record<string, string>,
  rowLabel: string
): { tiers: TierMoneyMinor } | { error: string } => {
  const base = parseMoneyToMinor(row["base_sale_price"])
  const t10 = parseMoneyToMinor(row["tier_10_to_49_price"])
  const t50 = parseMoneyToMinor(row["tier_50_to_99_price"])
  const t100 = parseMoneyToMinor(row["tier_100_plus_price"])
  if (base === null || t10 === null || t50 === null || t100 === null) {
    return {
      error: `${rowLabel}: when tier pricing is used, BASE_SALE_PRICE, TIER_10_TO_49_PRICE, TIER_50_TO_99_PRICE, and TIER_100_PLUS_PRICE must all be valid amounts.`,
    }
  }
  return { tiers: { base, t10, t50, t100 } }
}

const variantPricesFromRow = (
  row: Record<string, string>,
  tierHint: TierMoneyMinor | undefined
): VariantPrice[] => {
  const prices: VariantPrice[] = []
  const audFlat = parseMoneyToMinor(row["variant price aud"])
  const eur = parseMoneyToMinor(row["variant price eur"])
  const usd = parseMoneyToMinor(row["variant price usd"])

  if (tierHint) {
    prices.push({ amount: tierHint.base, currency_code: "aud" })
  } else if (audFlat !== null) {
    prices.push({ amount: audFlat, currency_code: "aud" })
  }
  if (eur !== null) {
    prices.push({ amount: eur, currency_code: "eur" })
  }
  if (usd !== null) {
    prices.push({ amount: usd, currency_code: "usd" })
  }

  return prices
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

    if (tierColumnsPartiallyFilled(row)) {
      const r = parseTierMinorFromRow(row, rowLabel)
      if ("error" in r) {
        validationErrors.push(r.error)
      } else {
        tierRules++
      }
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

export type BuildCreatesResult = {
  creates: SpreadsheetProductCreate[]
  tierBySku: Map<string, TierMoneyMinor>
  errors: string[]
}

export const buildBatchCreatesFromParsedCsv = (parsed: ParsedCsv): BuildCreatesResult => {
  const errors: string[] = []
  const tierBySku = new Map<string, TierMoneyMinor>()

  const headerErr = validateHeaders(parsed)
  if (headerErr) {
    errors.push(headerErr)
    return { creates: [], tierBySku, errors }
  }

  const preview = computeSpreadsheetPreview(parsed)
  preview.validationErrors.forEach((e) => errors.push(e))

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

      let tierHint: TierMoneyMinor | undefined
      if (tierColumnsPartiallyFilled(row)) {
        const parsedTier = parseTierMinorFromRow(row, rowLabel)
        if ("error" in parsedTier) {
          errors.push(parsedTier.error)
          return
        }
        tierHint = parsedTier.tiers
        tierBySku.set(sku, tierHint)
      }

      const optVal = (row["variant option 1 value"] ?? "").trim() || "Default"
      const optionsMap: Record<string, string> = { [optionTitle]: optVal }
      if (opt2TitleRaw) {
        const optVal2 = (row["variant option 2 value"] ?? "").trim() || "Default"
        optionsMap[opt2TitleRaw] = optVal2
      }

      const prices = variantPricesFromRow(row, tierHint)
      if (!prices.length) {
        errors.push(`${rowLabel}: set Variant Price AUD (and/or EUR/USD), or tier columns for AUD base.`)
        return
      }

      const weightRaw = (row["variant weight"] ?? "").trim()
      let weight: number | undefined
      if (weightRaw !== "") {
        const w = Number.parseInt(weightRaw, 10)
        if (Number.isFinite(w)) {
          weight = w
        }
      }

      variants.push({
        title: (row["variant title"] ?? "").trim() || sku,
        sku,
        barcode: (row["variant barcode"] ?? "").trim() || undefined,
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

  return { creates, tierBySku, errors }
}

export const PRODUCT_BATCH_CHUNK_SIZE = 10

export function chunkCreates<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
