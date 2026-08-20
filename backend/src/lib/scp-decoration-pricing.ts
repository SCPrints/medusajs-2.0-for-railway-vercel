/**
 * Canonical decoration pricing — the ONE place the per-garment decoration
 * charge (DTF print + embroidery + screen) is derived from a line's
 * customizerDesign metadata. Phase 1 of the pricing-integrity work.
 *
 * History: this math lived in three copies — computeScpLineDescriptor (cart
 * add), the scp-update-design route, and recomputeScpCartPricing — and the
 * copies drifted TWICE: the recompute dropped embroidery (order #44 shipped
 * with the charge missing), then the update-design route missed screen when
 * screen printing shipped (2026-08-18). All three now call this function;
 * behavior is locked by the characterization golden vectors in
 * __tests__/fixtures/pricing-golden.json.
 *
 * The quantity semantics differ BY DESIGN across call sites and are explicit
 * parameters, not baked in:
 *   - printTierQuantity: drives the DTF print-size tier AND the screen
 *     colour tier. Add/update paths pass the line's own quantity; the
 *     cart-wide recompute passes the aggregated bulk-eligible quantity
 *     (cross-line tier aggregation — a screen run's per-piece price falls
 *     as the whole job grows).
 *   - embroideryQuantity: drives the embroidery quantity tier AND the
 *     digitizing-fee amortisation (fee ÷ qty baked into the unit price).
 *     Every path passes the line's own quantity — digitizing is per-line
 *     today (see the digitizing-dedup follow-up before changing this).
 *   - screenHeavyGarment: product-level surcharge flag. The add/update paths
 *     resolve it live from product.metadata.screen_heavy (server-side, so
 *     the client can't omit it); the recompute reuses the flag stamped in
 *     the line's screen_breakdown at add time.
 *
 * The garment component is intentionally NOT computed here — its source
 * legitimately differs per path (live region price at add; live ladder with
 * stored fallback in the recompute) and is summed by the caller.
 */
import {
  MAX_AUTO_PRICED_STITCHES,
  calculateEmbroideryUnitPriceMajor,
} from "./embroidery-pricing"
import { screenUnitMajor } from "./scp-screen-print-pricing"
import {
  decoratedLocationsFromLineMetadata,
  decoratedSidesFromLineMetadata,
  resolveScpTierIndexForQuantity,
  scpPrintTotalMajorFromLocations,
  scpPrintTotalMajorPerGarmentForSides,
  type ScpPrintSizeId,
} from "./scp-dtf-print-pricing"

export type EmbroideryBreakdownEntry = {
  side: string
  stitchCount: number
  unitDecorationMajor: number
  digitizingFeeMajor: number
  unitPriceMajor: number
  requiresQuote: boolean
}

export type ScreenBreakdownEntry = {
  side: string
  colours: number
  effectiveColours: number
  darkGarment: boolean
  heavyGarment: boolean
  unitPriceMajor: number
}

export type SideEmbroideryConfig = {
  stitchCount?: number
  includeDigitizingFee?: boolean
}

export type SideScreenConfig = {
  colours?: number
  darkGarment?: boolean
}

export type DecorationTotals = {
  /** All decorated sides in metadata order (print + embroidery + screen). */
  decoratedSides: string[]
  printSides: string[]
  embroiderySides: string[]
  screenSides: string[]
  /** DTF print tier index actually used (from printTierQuantity). */
  printTierIndex: number
  printTotalMajor: number
  embroideryTotalMajor: number
  embroideryBreakdown: EmbroideryBreakdownEntry[]
  screenTotalMajor: number
  screenBreakdown: ScreenBreakdownEntry[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

const objectOrEmpty = <T>(value: unknown): T =>
  (typeof value === "object" && value !== null ? value : {}) as T

/**
 * Derive the per-garment decoration totals from a cart/order line's metadata.
 * Pure: no container, no DB — safe for routes, recomputes, invariants, and
 * audits alike. Callers resolve garment price and the heavy-garment flag.
 */
export function computeDecorationTotals(args: {
  metadata: Record<string, unknown> | null | undefined
  printSizeId: ScpPrintSizeId
  printTierQuantity: number
  embroideryQuantity: number
  screenHeavyGarment: boolean
}): DecorationTotals {
  const metadata = args.metadata ?? {}

  const decoratedSides = decoratedSidesFromLineMetadata(metadata)
  const decoratedLocations = decoratedLocationsFromLineMetadata(metadata)

  // Read per-side decoration methods (v3 schema). v2 metadata has no entries,
  // so all sides default to "print" — preserves legacy behaviour.
  const customizerDesign = objectOrEmpty<Record<string, unknown>>(
    (metadata as Record<string, unknown>).customizerDesign
  )
  const sideDecorationMethods = objectOrEmpty<Record<string, string>>(
    customizerDesign.sideDecorationMethods
  )
  const sideEmbroideryConfigs = objectOrEmpty<Record<string, SideEmbroideryConfig>>(
    customizerDesign.sideEmbroideryConfigs
  )
  const sideScreenConfigs = objectOrEmpty<Record<string, SideScreenConfig>>(
    customizerDesign.sideScreenConfigs
  )

  const printSides = decoratedSides.filter(
    (side) => (sideDecorationMethods[side] ?? "print") === "print"
  )
  const embroiderySides = decoratedSides.filter(
    (side) => sideDecorationMethods[side] === "embroidery"
  )
  const screenSides = decoratedSides.filter(
    (side) => sideDecorationMethods[side] === "screen"
  )

  const printLocations = decoratedLocations.filter((loc) => {
    const side = (loc as { side?: string }).side
    return !side || (sideDecorationMethods[side] ?? "print") === "print"
  })

  const printTierIndex = resolveScpTierIndexForQuantity(args.printTierQuantity)
  const printTotalMajor =
    printSides.length === 0
      ? 0
      : printLocations.length > 0
      ? scpPrintTotalMajorFromLocations({
          selectedPrintSizeId: args.printSizeId,
          tierIndex: printTierIndex,
          locations: printLocations,
        })
      : scpPrintTotalMajorPerGarmentForSides({
          selectedPrintSizeId: args.printSizeId,
          tierIndex: printTierIndex,
          decoratedSides: printSides,
        })

  let embroideryTotalMajor = 0
  const embroideryBreakdown: EmbroideryBreakdownEntry[] = []
  for (const side of embroiderySides) {
    const cfg = sideEmbroideryConfigs[side]
    const stitchCount = Math.max(0, Math.floor(cfg?.stitchCount ?? 0))
    if (stitchCount <= 0) continue
    if (stitchCount > MAX_AUTO_PRICED_STITCHES) {
      embroideryBreakdown.push({
        side,
        stitchCount,
        unitDecorationMajor: 0,
        digitizingFeeMajor: 0,
        unitPriceMajor: 0,
        requiresQuote: true,
      })
      continue
    }
    const result = calculateEmbroideryUnitPriceMajor({
      stitchCount,
      quantity: Math.max(1, Math.floor(args.embroideryQuantity || 1)),
      includeDigitizing: cfg?.includeDigitizingFee !== false,
    })
    embroideryTotalMajor += result.unitPriceMajor
    embroideryBreakdown.push({
      side,
      stitchCount,
      unitDecorationMajor: result.unitDecorationMajor,
      digitizingFeeMajor: result.digitizingFeeMajor,
      unitPriceMajor: result.unitPriceMajor,
      requiresQuote: false,
    })
  }

  let screenTotalMajor = 0
  const screenBreakdown: ScreenBreakdownEntry[] = []
  for (const side of screenSides) {
    const cfg = sideScreenConfigs[side]
    const colours = Math.max(1, Math.floor(cfg?.colours ?? 1))
    const darkGarment = cfg?.darkGarment === true
    const result = screenUnitMajor({
      quantity: args.printTierQuantity,
      colours,
      darkGarment,
      heavyGarment: args.screenHeavyGarment,
    })
    screenTotalMajor = round2(screenTotalMajor + result.unitMajor)
    screenBreakdown.push({
      side,
      colours,
      effectiveColours: result.effectiveColours,
      darkGarment,
      heavyGarment: args.screenHeavyGarment,
      unitPriceMajor: result.unitMajor,
    })
  }

  return {
    decoratedSides,
    printSides,
    embroiderySides,
    screenSides,
    printTierIndex,
    printTotalMajor: Math.max(0, printTotalMajor),
    embroideryTotalMajor: Math.max(0, embroideryTotalMajor),
    embroideryBreakdown,
    screenTotalMajor: Math.max(0, screenTotalMajor),
    screenBreakdown,
  }
}

/**
 * Sum of the stored heavy-garment flags in a line's stamped screen breakdown
 * — the recompute's source for `screenHeavyGarment` (no product lookup).
 */
export function screenHeavyFromStoredBreakdown(
  server: Record<string, unknown> | null | undefined
): boolean {
  const breakdown = server?.screen_breakdown
  return (
    Array.isArray(breakdown) &&
    breakdown.some((entry) => (entry as { heavyGarment?: unknown })?.heavyGarment === true)
  )
}

/**
 * Live heavy-garment lookup for the add/update paths: reads
 * product.metadata.screen_heavy server-side so the client can't omit the
 * surcharge. Best-effort — a failed lookup prices without the surcharge
 * rather than failing the cart operation (same stance as the original
 * descriptor implementation).
 */
export async function resolveScreenHeavyGarment(
  query: { graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }> },
  variantId: string
): Promise<boolean> {
  try {
    const { data: variantRows } = await query.graph({
      entity: "variant",
      fields: ["id", "product.metadata"],
      filters: { id: variantId },
    })
    const productMeta = (variantRows?.[0] as any)?.product?.metadata as
      | Record<string, unknown>
      | undefined
    return productMeta?.screen_heavy === true
  } catch {
    return false
  }
}
