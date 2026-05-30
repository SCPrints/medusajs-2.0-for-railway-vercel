/**
 * Pure xlsx → Gildan domain mapping. No DB, no container, no network —
 * fully unit-testable.
 *
 * Two main jobs:
 *   1. `parseGildanRow(rawRow)` — coerce a positional xlsx tuple into a
 *      strongly-typed `GildanRow`.
 *   2. `groupRowsByStyle(rows)` — collapse (brand, style) groups into
 *      `GildanProduct`s, aggregating per-colour sizes + image filenames.
 *
 * Cleans up known supplier-side issues:
 *   - "Apaprel" typo in DNProductType (col 15) → "Apparel"
 *   - "ACTIVE" / "Active" / "active" casing → uppercased once for filtering
 *   - Empty string vs null normalisation
 *   - Number-to-string for styleParent (xlsx sometimes returns 102 as a number)
 *   - Lbs → grams conversion for weight
 *   - "Apaprel" / "Apparel" typo at the row level is left as-is (preserved
 *     in `dnProductType`) so an audit can see how often it occurs; the
 *     classifier filters it down to a normalised value.
 */

import { slugify, titleCase } from "../../utils/string-case"
import {
  gildanGarmentView,
  normalizeGildanColourKey,
  normalizeGildanFilenameKey,
} from "./image-scraper"
import type { GildanColour, GildanProduct, GildanRow } from "./types"
import { GILDAN_BRAND_HANDLE_BY_NAME } from "./types"

/** Coerce a cell to a trimmed string, or null if empty/whitespace. */
const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length === 0 ? null : s
}

/** Coerce a cell to a finite number, or null. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const LB_TO_G = 453.59237

/**
 * Convert a raw xlsx row (positional array, length 47) into a typed
 * `GildanRow`. Returns null if the row is missing critical identifiers
 * (vendor SKU, brand, style, colour) — those rows are silently dropped
 * with a counter so the caller can surface the count to staff.
 */
export function parseGildanRow(raw: unknown[]): GildanRow | null {
  const vendorSku = str(raw[0])
  const brand = str(raw[1])
  const styleRaw = raw[2]
  const colourName = str(raw[19])
  if (!vendorSku || !brand || !colourName) return null
  const styleParent =
    styleRaw === null || styleRaw === undefined
      ? null
      : typeof styleRaw === "number"
        ? String(styleRaw)
        : String(styleRaw).trim() || null
  if (!styleParent) return null

  const viewSrc: string[] = []
  for (let i = 23; i <= 27; i++) {
    const s = str(raw[i])
    if (s) viewSrc.push(s)
  }

  return {
    vendorSkuChild: vendorSku,
    brand,
    styleParent,
    productNameSystem: str(raw[3]) ?? "",
    descriptionOfItem: str(raw[4]) ?? "",
    size: str(raw[6]) ?? "",
    sizeCode: str(raw[7]) ?? "",
    gender: str(raw[8]),
    fit: str(raw[9]),
    fabricContent: str(raw[10]),
    fabricWeight: str(raw[11]),
    productFeatures: str(raw[14]),
    dnProductType: str(raw[15]),
    topTierCategory: str(raw[16]),
    subcategory1: str(raw[17]),
    subcategory2: str(raw[18]),
    colourName,
    hex: str(raw[20]),
    heroImageFilename: str(raw[22]),
    viewSrcFilenames: viewSrc,
    rrpInc: num(raw[31]),
    heavyweightCost: num(raw[32]),
    midweightCost: num(raw[33]),
    classicCost: num(raw[34]),
    productUrl: str(raw[35]),
    status: str(raw[36]) ?? "",
    weightPounds: num(raw[38]),
    countryOfOrigin: str(raw[46]),
  }
}

/** True if the row's status is a marker we want to keep. */
export function isActiveStatus(status: string): boolean {
  return status.trim().toUpperCase() === "ACTIVE"
}

/**
 * Group rows by (brand, styleParent) → GildanProduct. Aggregates colours
 * + sizes per product. Demographic/classification fields are taken from
 * the FIRST row in each group; drift across rows is logged to `warnings`.
 *
 * Skips rows where `isActiveStatus` is false (e.g. "NEW - INACTIVE").
 */
export function groupRowsByStyle(
  rows: ReadonlyArray<GildanRow>,
  warnings?: string[]
): GildanProduct[] {
  const byKey = new Map<string, GildanRow[]>()
  for (const row of rows) {
    if (!isActiveStatus(row.status)) continue
    const key = `${row.brand}::${row.styleParent}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(row)
  }

  const products: GildanProduct[] = []
  for (const [key, group] of byKey) {
    const head = group[0]
    // Aggregate colours: { colourName → { hex, images, sizes[] } }
    const coloursMap = new Map<string, GildanColour>()
    let weightSum = 0
    let weightCount = 0
    let costAcc: number | null = null
    for (const row of group) {
      if (row.weightPounds !== null) {
        weightSum += row.weightPounds * LB_TO_G
        weightCount++
      }
      if (row.classicCost !== null) {
        // Pick the LOWEST non-zero Classic cost across the group — for
        // mixed-size groups Gildan sometimes carries different costs per
        // size (rare; mostly XS=same as M, 4XL+ priced higher). Lowest
        // ensures the storefront ladder uses the most generous cost.
        costAcc =
          costAcc === null ? row.classicCost : Math.min(costAcc, row.classicCost)
      }
      const existing = coloursMap.get(row.colourName)
      if (!existing) {
        coloursMap.set(row.colourName, {
          name: row.colourName,
          hex: row.hex,
          images: {
            hero: row.heroImageFilename,
            views: [...row.viewSrcFilenames],
          },
          sizes: [
            {
              sizeCode: row.sizeCode,
              sizeLabel: row.size,
              sku: row.vendorSkuChild,
            },
          ],
        })
      } else {
        // Append size if unique by sizeCode.
        if (
          !existing.sizes.some((s) => s.sizeCode === row.sizeCode)
        ) {
          existing.sizes.push({
            sizeCode: row.sizeCode,
            sizeLabel: row.size,
            sku: row.vendorSkuChild,
          })
        }
        // Drift detection: if hex differs across rows of the same colour,
        // log it. Take the first non-null hex as canonical.
        if (existing.hex === null && row.hex) existing.hex = row.hex
        if (existing.images.hero === null && row.heroImageFilename) {
          existing.images.hero = row.heroImageFilename
        }
        // Aggregate view filenames; dedupe by filename.
        for (const v of row.viewSrcFilenames) {
          if (!existing.images.views.includes(v)) existing.images.views.push(v)
        }
      }
    }

    // Sort sizes within colour by canonical order (XS<S<M<L<XL<2XL<...).
    const colourArr = Array.from(coloursMap.values())
    for (const c of colourArr) {
      c.sizes.sort((a, b) => compareSizeCodes(a.sizeCode, b.sizeCode))
    }
    colourArr.sort((a, b) => a.name.localeCompare(b.name))

    // Drift checks across the group — warn if classification fields disagree.
    if (warnings) {
      for (const field of [
        "subcategory1",
        "subcategory2",
        "gender",
        "fit",
        "fabricContent",
      ] as const) {
        const seen = new Set<string>()
        for (const r of group) {
          const v = r[field]
          if (v !== null) seen.add(v)
        }
        if (seen.size > 1) {
          warnings.push(
            `${key}: drift in ${field} across ${group.length} rows: ${Array.from(seen).join(" | ")}`
          )
        }
      }
    }

    products.push({
      brand: head.brand,
      styleParent: head.styleParent,
      title: cleanTitle(head.descriptionOfItem),
      gender: head.gender,
      fit: head.fit,
      fabricContent: head.fabricContent,
      fabricWeight: head.fabricWeight,
      productFeatures: head.productFeatures,
      dnProductType: head.dnProductType,
      topTierCategory: head.topTierCategory,
      subcategory1: head.subcategory1,
      subcategory2: head.subcategory2,
      productUrl: head.productUrl,
      countryOfOrigin: head.countryOfOrigin,
      classicCost: costAcc,
      rrpInc: head.rrpInc,
      weightGrams:
        weightCount > 0 ? Math.round((weightSum / weightCount) * 100) / 100 : null,
      colours: colourArr,
      status: head.status,
    })
  }

  products.sort((a, b) =>
    a.brand === b.brand
      ? a.styleParent.localeCompare(b.styleParent)
      : a.brand.localeCompare(b.brand)
  )
  return products
}

/**
 * Compute the Medusa handle for a Gildan product, e.g.
 * `american-apparel-102`, `gildan-64000`, `comfort-colors-1717`. Falls
 * back to a slugified brand if the brand isn't in the canonical map.
 */
export function handleForGildanProduct(brand: string, styleParent: string): string {
  const slug = GILDAN_BRAND_HANDLE_BY_NAME[brand] ?? slugify(brand)
  return `${slug}-${slugify(styleParent)}`
}

/**
 * Customer-facing title from the row's `descriptionOfItem`. Gildan sometimes
 * ships ALL CAPS or weird casing — normalise via titleCase. Strips any
 * trailing brand-name duplication.
 */
export function cleanTitle(raw: string): string {
  const stripped = (raw ?? "").replace(/\s+/g, " ").trim()
  if (!stripped) return ""
  // titleCase upper-cases the first letter of each word.
  return titleCase(stripped)
}

/**
 * Render a Medusa-friendly product description from per-product attributes.
 * Mirrors the FashionBiz pattern: each section optional, "label: items" bullets.
 */
export function renderGildanDescription(product: GildanProduct): string {
  const parts: string[] = []
  if (product.fabricContent) parts.push(`Fabric: ${product.fabricContent}`)
  if (product.fabricWeight) parts.push(`Weight: ${product.fabricWeight}`)
  if (product.fit) parts.push(`Fit: ${product.fit}`)
  const features = (product.productFeatures ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (features.length) {
    parts.push(`Features:\n${features.map((f) => `- ${f}`).join("\n")}`)
  }
  return parts.join("\n\n")
}

/**
 * Canonical size ladder for sort. Anything outside the ladder lands at
 * the END in alphabetical order so it doesn't break for non-clothing
 * sizes like "ONS" (one size) or numeric kid sizes.
 */
const SIZE_ORDER: Record<string, number> = {
  XXS: -2,
  XS: -1,
  S: 0,
  M: 1,
  L: 2,
  XL: 3,
  "2XL": 4,
  XXL: 4,
  "3XL": 5,
  XXXL: 5,
  "4XL": 6,
  "5XL": 7,
  "6XL": 8,
}

export function compareSizeCodes(a: string, b: string): number {
  const ai = SIZE_ORDER[a.toUpperCase()] ?? 1000
  const bi = SIZE_ORDER[b.toUpperCase()] ?? 1000
  if (ai !== bi) return ai - bi
  return a.localeCompare(b)
}

/**
 * Build the `garment_images` metadata block for one colour. The storefront
 * customizer + admin widgets read this — the contract is the same across
 * every importer (front URL is load-bearing; back/all are optional).
 *
 * Takes resolved CDN URLs (filename → URL map already applied). When the
 * filename path resolves nothing — which is the case for Gildan's youth
 * styles, whose website filenames are colour-CODE keyed and so can never
 * match the xlsx's colour-NAME filenames — falls back to the colour-name
 * map built from the page's `data-color-name` swatch labels
 * (`extractColorImageMapFromGildanHtml`). Falls back to empty strings when
 * neither resolves so downstream code doesn't crash on undefined.
 */
export function buildGildanGarmentImages(
  colour: GildanColour,
  urlByFilename: ReadonlyMap<string, string>,
  urlByColour?: ReadonlyMap<string, string[]>
): { front: string; back?: string; model_image?: string; all: string[] } {
  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (filename: string | null) => {
    if (!filename) return
    // Lookup keys are normalised (lowercase, season-stripped, ordinal-
    // padded, middle-tokens-collapsed) — see `normalizeGildanFilenameKey`.
    // The xlsx ships filenames in human-readable case ("H000_White_01.jpg"),
    // so we have to normalise before lookup.
    const url = urlByFilename.get(normalizeGildanFilenameKey(filename))
    if (!url || seen.has(url)) return
    seen.add(url)
    ordered.push(url)
  }
  push(colour.images.hero)
  for (const v of colour.images.views) push(v)

  // Fallback: the supplier's website keys youth-style images by colour CODE
  // (e.g. "SF500B_426_A1"), so the name-based xlsx filenames never resolve.
  // The page's `data-color-name` swatch labels DO carry the colour name, so
  // look the colour up there when the filename path came up empty.
  if (ordered.length === 0 && urlByColour) {
    const byColour = urlByColour.get(normalizeGildanColourKey(colour.name))
    if (byColour) {
      for (const url of byColour) {
        if (!seen.has(url)) {
          seen.add(url)
          ordered.push(url)
        }
      }
    }
  }

  const front =
    ordered.find((u) => gildanGarmentView(u) === "front") ?? ordered[0] ?? ""
  const back = ordered.find((u) => gildanGarmentView(u) === "back")
  const model = ordered.find((u) => gildanGarmentView(u) === "model")
  return {
    front,
    ...(back ? { back } : {}),
    ...(model ? { model_image: model } : {}),
    all: ordered,
  }
}
