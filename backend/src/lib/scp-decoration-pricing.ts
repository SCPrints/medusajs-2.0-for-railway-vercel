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
  DIGITIZING_FEE_MAJOR,
  MAX_AUTO_PRICED_STITCHES,
  calculateEmbroideryUnitPriceMajor,
} from "./embroidery-pricing"
import { screenUnitMajor } from "./scp-screen-print-pricing"
import {
  SUPACOLOUR_QUOTE_ONLY_SIZES,
  parseDecorationPricingClass,
  supacolourUnitMajorForTier,
  type DecorationPricingClass,
} from "./scp-supacolour-pricing"
import {
  decoratedLocationsFromLineMetadata,
  decoratedSidesFromLineMetadata,
  resolveScpPrintSizeForSide,
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
  widthMm?: number
  heightMm?: number
}

/**
 * One embroidery side's claim on a digitized file. Digitizing is charged per
 * DISTINCT FILE, not per side or per line: the same artwork at the same size
 * (within the ~5% resize tolerance the machines allow) reuses one file no
 * matter how many sides/garments it lands on; the same artwork resized
 * beyond that needs a fresh digitization and a fresh fee.
 */
export type DigitizingUnitEntry = {
  side: string
  /**
   * Identity of the artwork: sorted image-object sources on the side (the
   * customer-original upload URLs are stable per upload). Falls back to text
   * content for text-only embroidery. Non-fingerprintable sides get a
   * scope-token key so they NEVER merge across lines (fail toward charging).
   */
  artworkKey: string
  fingerprintable: boolean
  widthMm: number
  heightMm: number
  includeFee: boolean
  /** Exact per-line lookup key — stable for map lookups after clustering. */
  key: string
}

/** ~5% resize tolerance: beyond this the design must be re-digitized. */
export const DIGITIZING_RESIZE_TOLERANCE = 0.05

const dimsWithinTolerance = (a: DigitizingUnitEntry, b: DigitizingUnitEntry): boolean => {
  const close = (x: number, y: number) =>
    x === y || (x > 0 && y > 0 && Math.abs(x - y) / Math.max(x, y) <= DIGITIZING_RESIZE_TOLERANCE)
  return close(a.widthMm, b.widthMm) && close(a.heightMm, b.heightMm)
}

/**
 * Extract the digitizing-unit entries for a line's embroidery sides.
 * `scopeToken` namespaces non-fingerprintable sides (pass the line id) so
 * they can't accidentally merge across lines.
 */
export function embroideryDigitizingUnits(
  metadata: Record<string, unknown> | null | undefined,
  scopeToken: string
): DigitizingUnitEntry[] {
  const customizerDesign = objectOrEmpty<Record<string, unknown>>(
    (metadata ?? {}).customizerDesign
  )
  const sideDecorationMethods = objectOrEmpty<Record<string, string>>(
    customizerDesign.sideDecorationMethods
  )
  const sideEmbroideryConfigs = objectOrEmpty<Record<string, SideEmbroideryConfig>>(
    customizerDesign.sideEmbroideryConfigs
  )
  const sideLayoutsRaw = customizerDesign.sideLayouts
  const layoutBySide = new Map<string, unknown[]>()
  if (Array.isArray(sideLayoutsRaw)) {
    for (const entry of sideLayoutsRaw) {
      const side = (entry as { side?: unknown })?.side
      const objects = (entry as { objects?: unknown })?.objects
      if (typeof side === "string" && Array.isArray(objects)) {
        layoutBySide.set(side, objects)
      }
    }
  }

  const entries: DigitizingUnitEntry[] = []
  for (const side of decoratedSidesFromLineMetadata(metadata ?? {})) {
    if (sideDecorationMethods[side] !== "embroidery") continue
    const cfg = sideEmbroideryConfigs[side]
    const stitchCount = Math.max(0, Math.floor(cfg?.stitchCount ?? 0))
    if (stitchCount <= 0 || stitchCount > MAX_AUTO_PRICED_STITCHES) continue

    const objects = layoutBySide.get(side) ?? []
    const sources: string[] = []
    for (const raw of objects) {
      const obj = raw as { src?: unknown; text?: unknown }
      if (typeof obj.src === "string" && obj.src.length > 0) sources.push(obj.src)
      else if (typeof obj.text === "string" && obj.text.trim().length > 0)
        sources.push(`text:${obj.text.trim()}`)
    }
    const fingerprintable = sources.length > 0
    const artworkKey = fingerprintable
      ? sources.sort().join("|")
      : `unfingerprinted:${scopeToken}:${side}`
    const widthMm = Number(cfg?.widthMm) > 0 ? Number(cfg?.widthMm) : 0
    const heightMm = Number(cfg?.heightMm) > 0 ? Number(cfg?.heightMm) : 0
    entries.push({
      side,
      artworkKey,
      fingerprintable,
      widthMm,
      heightMm,
      includeFee: cfg?.includeDigitizingFee !== false,
      key: `${artworkKey}::${widthMm}x${heightMm}`,
    })
  }
  return entries
}

/**
 * Cluster digitizing entries (from one or many lines) into distinct files:
 * same artworkKey + dimensions within the resize tolerance = one file.
 * Returns, for each entry's exact `key`, the cluster it belongs to — the
 * caller sums quantities per cluster to derive the amortisation base.
 */
export function clusterDigitizingEntries(
  entries: DigitizingUnitEntry[]
): Map<string, DigitizingUnitEntry[]> {
  const clusters: Array<{ rep: DigitizingUnitEntry; members: DigitizingUnitEntry[] }> = []
  for (const entry of entries) {
    const match = clusters.find(
      (c) => c.rep.artworkKey === entry.artworkKey && dimsWithinTolerance(c.rep, entry)
    )
    if (match) match.members.push(entry)
    else clusters.push({ rep: entry, members: [entry] })
  }
  const byKey = new Map<string, DigitizingUnitEntry[]>()
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      byKey.set(member.key, cluster.members)
    }
  }
  return byKey
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
  /**
   * Embroidery sides with NO usable stitch count — they price at $0
   * decoration. The add/update routes REJECT lines carrying these (the
   * storefront forces the config panel before add-to-cart); the recompute
   * tolerates them for already-in-cart legacy lines, and the checkout
   * invariant flags them as free_decoration.
   */
  unconfiguredEmbroiderySides: string[]
  /** DTF print tier index actually used (from printTierQuantity). */
  printTierIndex: number
  /**
   * Full-colour print sides on a Supacolour garment whose size has no
   * Supacolour equivalent (oversize) — price $0, quote-only. Add/update
   * routes reject these; the invariant flags them.
   */
  supacolourQuoteSides: string[]
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
  /**
   * Which full-colour card prices the print sides: absent/"dtf" = the DTF
   * matrix; "supacolour" = the premium transfer matrix (poly/blend garments,
   * product.metadata.decoration_pricing_class). The add/update paths resolve
   * it live from the product; the recompute + invariant reuse the
   * `full_colour_card` stamped in the line's server block at add time.
   */
  fullColourCard?: "dtf" | "supacolour"
  /**
   * Cart-wide digitizing amortisation: per exact entry `key`, the TOTAL
   * quantity of garments (across all cart lines) sharing that digitized
   * file. The recompute supplies this after clustering the whole cart;
   * absent (add/update paths), each unit amortises over embroideryQuantity
   * — the recompute settles it to the cart-wide base moments later.
   */
  digitizingAmortQtyByKey?: Map<string, number>
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
  const supacolour = args.fullColourCard === "supacolour"
  const supacolourQuoteSides: string[] = []
  let printTotalMajor = 0
  if (printSides.length === 0) {
    printTotalMajor = 0
  } else if (supacolour) {
    // Premium transfer card. Same per-location shape as the DTF paths, with
    // the Supacolour matrix; oversize has no Supacolour size — $0 + flagged.
    const unitFor = (side: string, requested: ScpPrintSizeId): number => {
      const sizeId = resolveScpPrintSizeForSide(side, requested)
      if (SUPACOLOUR_QUOTE_ONLY_SIZES.has(sizeId)) {
        supacolourQuoteSides.push(side)
        return 0
      }
      return supacolourUnitMajorForTier(sizeId, printTierIndex) ?? 0
    }
    printTotalMajor =
      printLocations.length > 0
        ? round2(
            printLocations.reduce((sum, loc) => {
              const side = (loc as { side?: string }).side ?? "front"
              const requested =
                (loc as { printSizeId?: ScpPrintSizeId }).printSizeId ?? args.printSizeId
              return sum + unitFor(side, requested)
            }, 0)
          )
        : round2(
            printSides.reduce((sum, side) => sum + unitFor(side, args.printSizeId), 0)
          )
  } else {
    printTotalMajor =
      printLocations.length > 0
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
  }

  // Digitizing is charged per DISTINCT FILE (artwork + size within the ~5%
  // resize tolerance), not per side: two sides of one garment carrying the
  // same logo at the same size share one fee. Cross-line sharing (same file
  // across a size fan-out or across different garments in the cart) arrives
  // via digitizingAmortQtyByKey from the recompute.
  const embroideryQty = Math.max(1, Math.floor(args.embroideryQuantity || 1))
  const digitizingEntries = embroideryDigitizingUnits(metadata, "line")
  const clustersByKey = clusterDigitizingEntries(digitizingEntries)
  const entryBySide = new Map(digitizingEntries.map((e) => [e.side, e]))
  const feeChargedClusters = new Set<DigitizingUnitEntry[]>()

  let embroideryTotalMajor = 0
  const embroideryBreakdown: EmbroideryBreakdownEntry[] = []
  const unconfiguredEmbroiderySides: string[] = []
  for (const side of embroiderySides) {
    const cfg = sideEmbroideryConfigs[side]
    const stitchCount = Math.max(0, Math.floor(cfg?.stitchCount ?? 0))
    if (stitchCount <= 0) {
      unconfiguredEmbroiderySides.push(side)
      continue
    }
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
    const decoration = calculateEmbroideryUnitPriceMajor({
      stitchCount,
      quantity: embroideryQty,
      includeDigitizing: false,
    })

    // Fee attribution: charged once per cluster (on its first-seen side),
    // when any member of the cluster accepted the fee.
    let digitizingFeeMajor = 0
    let feeShareMajor = 0
    const entry = entryBySide.get(side)
    const cluster = entry ? clustersByKey.get(entry.key) : undefined
    if (entry && cluster && !feeChargedClusters.has(cluster)) {
      feeChargedClusters.add(cluster)
      const clusterWantsFee = cluster.some((m) => m.includeFee)
      if (clusterWantsFee) {
        digitizingFeeMajor = DIGITIZING_FEE_MAJOR
        const amortQty = Math.max(
          1,
          Math.floor(args.digitizingAmortQtyByKey?.get(entry.key) ?? embroideryQty)
        )
        feeShareMajor = digitizingFeeMajor / amortQty
      }
    }

    const unitPriceMajor = round2(decoration.unitDecorationMajor + feeShareMajor)
    embroideryTotalMajor += unitPriceMajor
    embroideryBreakdown.push({
      side,
      stitchCount,
      unitDecorationMajor: decoration.unitDecorationMajor,
      digitizingFeeMajor,
      unitPriceMajor,
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
    unconfiguredEmbroiderySides,
    printTierIndex,
    supacolourQuoteSides,
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
  return (await resolveDecorationProductFlags(query, variantId)).screenHeavy
}

export type DecorationProductFlags = {
  screenHeavy: boolean
  /** null = standard DTF card. */
  decorationPricingClass: DecorationPricingClass | null
}

/**
 * One product-metadata lookup serving every decoration flag: the screen
 * heavy-garment surcharge AND the full-colour pricing class (Supacolour /
 * quote-only). Best-effort — a failed lookup prices as a standard cotton
 * garment rather than failing the cart operation.
 */
export async function resolveDecorationProductFlags(
  query: { graph: (q: Record<string, unknown>) => Promise<{ data?: unknown[] }> },
  variantId: string
): Promise<DecorationProductFlags> {
  try {
    const { data: variantRows } = await query.graph({
      entity: "variant",
      fields: ["id", "product.metadata"],
      filters: { id: variantId },
    })
    const productMeta = (variantRows?.[0] as any)?.product?.metadata as
      | Record<string, unknown>
      | undefined
    return {
      screenHeavy: productMeta?.screen_heavy === true,
      decorationPricingClass: parseDecorationPricingClass(
        productMeta?.decoration_pricing_class
      ),
    }
  } catch {
    return { screenHeavy: false, decorationPricingClass: null }
  }
}

/**
 * The full-colour card stamped in a line's server block at add time — the
 * recompute + checkout invariant's lookup-free source (mirrors the
 * screenHeavyFromStoredBreakdown pattern).
 */
export function fullColourCardFromStoredServer(
  server: Record<string, unknown> | null | undefined
): "dtf" | "supacolour" {
  return server?.full_colour_card === "supacolour" ? "supacolour" : "dtf"
}
