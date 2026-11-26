/**
 * The customer's price list (/account/prices). Pure — unit-tested. Every
 * number comes from the canonical pricing code: the garment ladder / tier
 * price the cart charges, the DTF print matrix and the embroidery rate card.
 * All prices are GST-inclusive.
 */
import { studioDate } from "./business-days"
import type { Tier } from "./customer-tiers"
import {
  DIGITIZING_FEE_MAJOR,
  MAX_AUTO_PRICED_STITCHES,
  calculateEmbroideryUnitPriceMajor,
  resolveEmbroideryQuantityTier,
} from "./embroidery-pricing"
import { garmentMajorWithTier } from "./garment-ladder"
import {
  SCP_BLANK_ALIGNED_QUANTITY_TIERS,
  SCP_PRINT_SIZE_OPTIONS,
  scpPrintUnitMajorForTier,
} from "./scp-dtf-print-pricing"

export type PriceBreak = { label: string; min_quantity: number }
export type PriceRange = { min: number; max: number } | null

export const GARMENT_BREAKS: PriceBreak[] = SCP_BLANK_ALIGNED_QUANTITY_TIERS.map((t) => ({
  label: t.label.replace(/^Qty\s*/i, ""),
  min_quantity: t.minQuantity,
}))

/**
 * A garment's price at each quantity break, across its variants (bigger sizes
 * can cost more, so each break is a low–high range). A tier customer gets
 * their flat price in every column. `fallbackMajor` covers variants with no
 * ladder (their plain catalog price). null = no price known at that break.
 */
export function garmentBreakPrices(
  variants: Array<{ metadata?: Record<string, unknown> | null; fallbackMajor?: number | null }>,
  tier: Tier | null
): PriceRange[] {
  return GARMENT_BREAKS.map((b) => {
    const prices = variants
      .map((v) => garmentMajorWithTier(v.metadata ?? null, b.min_quantity, tier) ?? v.fallbackMajor ?? null)
      .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0)
    return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null
  })
}

export type DecorationTable = {
  title: string
  note: string
  columns: string[]
  rows: Array<{ label: string; prices: number[] }>
}

/** DTF print, per print position, by size and quantity. */
export function printPriceTable(): DecorationTable {
  return {
    title: "Printing (DTF)",
    note: "Per print position, on top of the garment price.",
    columns: GARMENT_BREAKS.map((b) => b.label),
    rows: SCP_PRINT_SIZE_OPTIONS.map((s) => ({
      label: `${s.label} (${s.dimensionsLabel})`,
      prices: GARMENT_BREAKS.map((_, i) => scpPrintUnitMajorForTier(s.id, i)),
    })),
  }
}

/** Embroidery, per position, by stitch count and quantity — read off the rate card by probing it. */
export function embroideryPriceTable(): DecorationTable & { setup_fee: number } {
  // The rate card keeps its quantity bands private; walk quantities to find where the band changes.
  const bands: Array<{ label: string; quantity: number }> = []
  for (let q = 1; q <= 1000; q++) {
    const { label } = resolveEmbroideryQuantityTier(q)
    if (bands[bands.length - 1]?.label !== label) bands.push({ label, quantity: q })
  }
  const rows: Array<{ label: string; prices: number[] }> = []
  let lastKey = ""
  for (let stitches = 1000; stitches <= MAX_AUTO_PRICED_STITCHES; stitches += 1000) {
    const prices = bands.map(
      (b) => calculateEmbroideryUnitPriceMajor({ stitchCount: stitches, quantity: b.quantity, includeDigitizing: false }).unitDecorationMajor
    )
    const key = prices.join("|")
    if (key === lastKey) continue // same price band as the row above
    lastKey = key
    rows.push({ label: `Up to ${stitches.toLocaleString("en-AU")} stitches`, prices })
  }
  return {
    title: "Embroidery",
    note: `Per position, on top of the garment price. One-off setup of $${DIGITIZING_FEE_MAJOR} per new logo. Bigger designs are quoted.`,
    columns: bands.map((b) => b.label),
    rows,
    setup_fee: DIGITIZING_FEE_MAJOR,
  }
}

export type PriceListGarment = {
  product_id: string
  title: string
  handle: string | null
  thumbnail: string | null
  /** Why it is on the list. */
  source: "ordered" | "shared"
  prices: PriceRange[]
}

export type PriceList = {
  generated_at: string
  currency_code: string
  /** The customer's pricing level, when they have one (flat garment prices). */
  tier: string | null
  breaks: PriceBreak[]
  garments: PriceListGarment[]
  decoration: DecorationTable[]
}

const cell = (r: PriceRange): string =>
  r == null ? "" : r.max > r.min ? `${r.min.toFixed(2)} - ${r.max.toFixed(2)}` : r.min.toFixed(2)

/** Rows for the CSV download. */
export function priceListCsvRows(list: PriceList): Array<Array<string | number>> {
  const date = studioDate(new Date(list.generated_at)) // Sydney date: the page and PDF say the same day
  const rows: Array<Array<string | number>> = [
    [`SC Prints price list, ${date}. Prices in AUD including GST. Prices can change.`],
    [],
    ["Garment", ...list.breaks.map((b) => `Qty ${b.label}`)],
    ...list.garments.map((g) => [g.title, ...g.prices.map(cell)]),
  ]
  for (const t of list.decoration) {
    rows.push([], [`${t.title}. ${t.note}`], ["Size", ...t.columns.map((c) => `Qty ${c}`)])
    for (const r of t.rows) rows.push([r.label, ...r.prices.map((p) => p.toFixed(2))])
  }
  return rows
}
