/**
 * Supacolour full-colour transfer rate card (AUD major units, inc GST) — the
 * price card used INSTEAD of the DTF matrix when the selected garment is
 * flagged `metadata.decoration_pricing_class = "supacolour"` (poly/blend
 * fabrics where standard DTF risks dye migration; ≥65% polyester per the
 * 2026-08 decision).
 *
 * Cost basis: DSP Supacolour price list 1 Mar 2024, BLOCKER (poly/blend)
 * transfer range + in-house pressing labour. Qty 1-19 is priced at the 20-49
 * transfer rate (Supacolour's bands start at 20) — margins verified in the
 * cost model workbook. Setup ($69 new / $35 repeat, per DESIGN not per
 * colour) is a separate cart line — see NEXT_PUBLIC_SUPACOLOUR_SETUP_VARIANT_ID.
 *
 * Keep in sync with storefront mirror:
 * {@link storefront/src/modules/customizer/lib/scp-supacolour-pricing.ts}
 * Validated by `scripts/check-supacolour-pricing-sync.mjs` (`pnpm check-sync`).
 */

import type { ScpPrintSizeId } from "./scp-dtf-print-pricing"

export const SCP_SUPACOLOUR_PRICING_VERSION = 1 as const

/** Per design (one artwork × one position), inc GST — separate cart line. */
export const SUPACOLOUR_SETUP_MAJOR = 69
export const SUPACOLOUR_REPEAT_SETUP_MAJOR = 35

/**
 * Supplier minimum, per design. Below it we can't buy the transfers at the
 * price on this card, so a customer can't pay for the line (see
 * supacolourDesignShortfalls). Staff quotes only warn.
 */
export const SUPACOLOUR_MIN_QUANTITY_PER_DESIGN = 10

export const SUPACOLOUR_MINIMUM_MESSAGE = `Supacolour transfers have a minimum of ${SUPACOLOUR_MIN_QUANTITY_PER_DESIGN} per design. Increase the quantity, or request a quote.`

export type SupacolourShortfall = { quantity: number; lineIds: string[] }

type SupacolourCartLine = {
  id: string
  quantity?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * Designs in a cart below the Supacolour minimum. Reads the server block
 * stamped at add time, so a client can't opt out. One design = the same
 * artwork at the same requested size, so it adds up across size lines,
 * garments and positions; artwork we can't identify counts within its own
 * add group, which errs towards blocking. Needs the full line metadata:
 * call before stripHeavyCartMetadataForRender drops sideLayouts.
 */
export function supacolourDesignShortfalls(
  lines: ReadonlyArray<SupacolourCartLine>
): SupacolourShortfall[] {
  const designs = new Map<string, SupacolourShortfall>()
  for (const line of lines) {
    const meta = line.metadata
    // Same exemptions as the checkout invariant: staff agreed these prices.
    if (!meta || meta.quote_locked_price === true || meta.price_override) continue
    const design = (meta.customizerDesign ?? {}) as {
      group_id?: unknown
      sideLayouts?: unknown
      pricing?: { server?: Record<string, unknown> }
    }
    const server = design.pricing?.server
    if (server?.full_colour_card !== "supacolour") continue
    const printSides = Array.isArray(server.print_side_keys) ? (server.print_side_keys as string[]) : []
    const layouts = Array.isArray(design.sideLayouts)
      ? (design.sideLayouts as Array<{ side?: string; objects?: unknown }>)
      : []
    const locations = Array.isArray(server.decorated_locations)
      ? (server.decorated_locations as Array<{ side?: string; printSizeId?: string }>)
      : []
    for (const side of printSides) {
      const objects = layouts.find((l) => l.side === side)?.objects
      const sources = (Array.isArray(objects) ? (objects as Array<{ src?: unknown; text?: unknown }>) : [])
        .map((o) => (typeof o.src === "string" && o.src ? o.src : typeof o.text === "string" && o.text.trim() ? `text:${o.text.trim()}` : ""))
        .filter(Boolean)
        .sort()
      const artwork = sources.length ? sources.join("|") : `${design.group_id || line.id}:${side}`
      const size = locations.find((l) => l.side === side)?.printSizeId ?? server.print_size_id
      const key = `${artwork}::${size}`
      const entry = designs.get(key) ?? { quantity: 0, lineIds: [] }
      entry.quantity += Math.max(0, Math.floor(line.quantity || 0))
      if (!entry.lineIds.includes(line.id)) entry.lineIds.push(line.id)
      designs.set(key, entry)
    }
  }
  return Array.from(designs.values()).filter((d) => d.quantity < SUPACOLOUR_MIN_QUANTITY_PER_DESIGN)
}

/**
 * Retail per print by DTF-aligned size and quantity tier (Qty 1-9 / 10-19 /
 * 20-49 / 50-99 / 100+). Oversize has no Supacolour size above A3/SQ —
 * quote-only, hence absent from the matrix.
 */
export const SCP_SUPACOLOUR_UNIT_MATRIX: Partial<
  Record<ScpPrintSizeId, readonly [number, number, number, number, number]>
> = {
  up_to_a6: [12, 11, 10.5, 10, 9.5],
  up_to_a4: [16, 15, 14.5, 13.5, 12.5],
  up_to_a3: [22, 21, 20, 18, 16.5],
}

/** Sizes with no Supacolour equivalent — quote-only on flagged garments. */
export const SUPACOLOUR_QUOTE_ONLY_SIZES = new Set<ScpPrintSizeId>(["oversize"])

export function supacolourUnitMajorForTier(
  printSizeId: ScpPrintSizeId,
  tierIndex: number
): number | null {
  const row = SCP_SUPACOLOUR_UNIT_MATRIX[printSizeId]
  if (!row) return null
  const idx = Math.min(Math.max(0, tierIndex), row.length - 1)
  return row[idx] ?? null
}

/** Values of product `metadata.decoration_pricing_class`. Absent = standard DTF. */
export const DECORATION_PRICING_CLASSES = ["supacolour", "quote_only"] as const
export type DecorationPricingClass = (typeof DECORATION_PRICING_CLASSES)[number]

export function parseDecorationPricingClass(
  value: unknown
): DecorationPricingClass | null {
  return value === "supacolour" || value === "quote_only" ? value : null
}
