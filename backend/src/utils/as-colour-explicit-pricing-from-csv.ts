/**
 * Parses AS Colour “explicit tier” spreadsheets (STYLECODE + BASE_SALE_PRICE / TIER_* columns),
 * resolves a style sheet row per variant (handle + SKU, optional metadata style override),
 * and applies pricing to Medusa export CSV supplemental columns — aligned with
 * `backend/src/scripts/update-as-colour-pricing.ts` (explicit BASE_SALE_PRICE mode).
 */

import { parseMoneyToMinor } from "./parse-money-to-minor"

export type AsColourPriceTier = {
  min_quantity: number
  max_quantity?: number
  amount: number
}

/** One style/band row from the website pricing sheet. */
export type AsColourStylePricing = {
  styleCode: string
  costPriceMinor: number | null
  tiers: AsColourPriceTier[]
}

type ExtendedSizeBand = "4XL" | "5XL"

export const normalizeStyleCode = (value?: string) => value?.trim().toUpperCase() || ""

export const parseExtendedSizeBandFromProductName = (
  productName?: string
): ExtendedSizeBand | null => {
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

export const extractExtendedSizeBandFromSku = (sku?: string): ExtendedSizeBand | null => {
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

export const stylePricingLookupKey = (styleCode: string, band: ExtendedSizeBand | null) =>
  band ? `${styleCode}:${band}` : styleCode

export const extractStyleCodeCandidatesFromSku = (sku?: string): string[] => {
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

/** Last segment of product handle, stripped to alphanumerics (AS Colour style code). */
export const extractStyleCodeFromHandle = (handle?: string): string => {
  if (!handle) {
    return ""
  }

  const normalized = handle.trim().toUpperCase()
  const parts = normalized.split("-").filter(Boolean)
  const tail = parts[parts.length - 1] ?? ""
  return tail.replace(/[^A-Z0-9]/g, "")
}

/**
 * Explicit BASE_SALE_PRICE / TIER_* columns (four qty bands; 10–49 column is one merged band).
 * Last row wins if duplicate lookup keys exist.
 */
export const buildExplicitStylePricingMapFromCsvRows = (
  rows: Record<string, string>[]
): { byLookupKey: Map<string, AsColourStylePricing>; duplicateLookupKeys: string[] } => {
  const byLookupKey = new Map<string, AsColourStylePricing>()
  const duplicateLookupKeys = new Set<string>()

  for (const row of rows) {
    const styleCode = normalizeStyleCode(row["STYLECODE"])
    if (!styleCode) {
      continue
    }

    const baseSaleMinor = parseMoneyToMinor(row["BASE_SALE_PRICE"])
    const tier10Minor = parseMoneyToMinor(row["TIER_10_TO_49_PRICE"])
    const tier50Minor = parseMoneyToMinor(row["TIER_50_TO_99_PRICE"])
    const tier100Minor = parseMoneyToMinor(row["TIER_100_PLUS_PRICE"])

    if (baseSaleMinor === null) {
      continue
    }

    const tiers: AsColourPriceTier[] = [
      { min_quantity: 1, max_quantity: 9, amount: baseSaleMinor },
    ]

    if (tier10Minor !== null) {
      tiers.push({ min_quantity: 10, max_quantity: 49, amount: tier10Minor })
    }
    if (tier50Minor !== null) {
      tiers.push({ min_quantity: 50, max_quantity: 99, amount: tier50Minor })
    }
    if (tier100Minor !== null) {
      tiers.push({ min_quantity: 100, amount: tier100Minor })
    }

    const stylePricing: AsColourStylePricing = {
      styleCode,
      costPriceMinor: parseMoneyToMinor(row["PRICE"]),
      tiers,
    }

    const band = parseExtendedSizeBandFromProductName(row["PRODUCT_NAME"])
    const lookupKey = stylePricingLookupKey(styleCode, band)

    if (byLookupKey.has(lookupKey)) {
      duplicateLookupKeys.add(lookupKey)
    }

    byLookupKey.set(lookupKey, stylePricing)
  }

  return {
    byLookupKey,
    duplicateLookupKeys: Array.from(duplicateLookupKeys),
  }
}

/**
 * Same resolution order as `resolveStylePricingForVariant` in update-as-colour-pricing.ts:
 * handle tail style, SKU token candidates, optional metadata style (last in candidate list for DB path;
 * here we omit metadata for CSV merge — pass if you add variant metadata to export).
 */
export const resolveStylePricingForHandlesAndSku = (
  productHandle: string | undefined,
  variantSku: string | undefined,
  metadataStyleCode: string | undefined,
  byLookupKey: Map<string, AsColourStylePricing>
): AsColourStylePricing | undefined => {
  const handleStyleCode = normalizeStyleCode(extractStyleCodeFromHandle(productHandle))
  const meta = normalizeStyleCode(metadataStyleCode)

  const styleCandidates = Array.from(
    new Set(
      [handleStyleCode, ...extractStyleCodeCandidatesFromSku(variantSku), meta].filter(
        Boolean
      ) as string[]
    )
  )

  const skuBand = extractExtendedSizeBandFromSku(variantSku)

  for (const code of styleCandidates) {
    if (skuBand) {
      const extendedHit = byLookupKey.get(stylePricingLookupKey(code, skuBand))
      if (extendedHit) {
        return extendedHit
      }
    }
    const baseHit = byLookupKey.get(code)
    if (baseHit) {
      return baseHit
    }
  }

  return undefined
}

const minorToMajorStr = (minor: number): string => String(minor / 100)

const MEDUSA_AUD_SUPPLEMENTAL_KEYS = [
  "Variant Price AUD",
  "BASE_SALE_PRICE",
  "TIER_10_TO_49_PRICE",
  "TIER_50_TO_99_PRICE",
  "TIER_100_PLUS_PRICE",
] as const

/** Writes major-unit strings + bulk_pricing JSON (minor amounts in JSON). */
export const applyExplicitStylePricingToMedusaExportRow = (
  row: Record<string, string>,
  pricing: AsColourStylePricing,
  bulkJsonSource: string
): void => {
  const tiers = pricing.tiers
  const t0 = tiers[0]
  const t10 = tiers[1]
  const t50 = tiers[2]
  const t100 = tiers[3]

  if (!t0) {
    return
  }

  row["BASE_SALE_PRICE"] = minorToMajorStr(t0.amount)
  row["TIER_10_TO_49_PRICE"] = t10 ? minorToMajorStr(t10.amount) : ""
  row["TIER_50_TO_99_PRICE"] = t50 ? minorToMajorStr(t50.amount) : ""
  row["TIER_100_PLUS_PRICE"] = t100 ? minorToMajorStr(t100.amount) : ""

  const anchor100 = t100 ?? tiers[tiers.length - 1]
  row["Variant Price AUD"] = anchor100 ? minorToMajorStr(anchor100.amount) : minorToMajorStr(t0.amount)

  row["Variant Bulk Pricing JSON"] = JSON.stringify({
    source: bulkJsonSource,
    currency_code: "aud",
    tiers: pricing.tiers.map((tier) => ({
      min_quantity: tier.min_quantity,
      ...(typeof tier.max_quantity === "number" ? { max_quantity: tier.max_quantity } : {}),
      amount: tier.amount,
    })),
  })
}

const normalizeMoneyCell = (s: string | undefined): string => {
  if (!s?.trim()) {
    return ""
  }
  const n = parseMoneyToMinor(s)
  return n === null ? s.trim() : String(n)
}

const normalizeBulkJson = (s: string | undefined): string => {
  const t = (s ?? "").trim()
  if (!t) {
    return ""
  }
  try {
    return JSON.stringify(JSON.parse(t))
  } catch {
    return t
  }
}

/** True if explicit pricing would change any supplemental AUD/bulk column on this row. */
export const explicitPricingDiffersFromExportRow = (
  row: Record<string, string>,
  pricing: AsColourStylePricing,
  bulkJsonSource: string
): boolean => {
  const preview: Record<string, string> = {}
  for (const k of MEDUSA_AUD_SUPPLEMENTAL_KEYS) {
    preview[k] = row[k] ?? ""
  }
  preview["Variant Bulk Pricing JSON"] = row["Variant Bulk Pricing JSON"] ?? ""

  applyExplicitStylePricingToMedusaExportRow(preview, pricing, bulkJsonSource)

  for (const k of MEDUSA_AUD_SUPPLEMENTAL_KEYS) {
    if (normalizeMoneyCell(row[k]) !== normalizeMoneyCell(preview[k])) {
      return true
    }
  }

  if (normalizeBulkJson(row["Variant Bulk Pricing JSON"]) !== normalizeBulkJson(preview["Variant Bulk Pricing JSON"])) {
    return true
  }

  return false
}
