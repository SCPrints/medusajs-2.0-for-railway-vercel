/**
 * SCP Digital Print price matrix (AUD major units) aligned with blank bulk tiers.
 *
 * Tier bands match variant `metadata.bulk_pricing` / {@link backend/src/utils/bulk-tier-prices.ts}.
 * Matrix rows follow SCP DIGITAL PRINT price list mapped per plan:
 *   tier 0 (qty 1–9)   ← PDF "1–5" row
 *   tier 1 (qty 10–19) ← PDF "6–24" row
 *   tier 2 (qty 20–49) ← PDF "25–49" row
 *   tier 3 (qty 50–99) ← PDF "50–99" row
 *   tier 4 (qty 100+)  ← PDF "100+" row
 *
 * Keep in sync with storefront mirror:
 * {@link storefront/src/modules/customizer/lib/scp-dtf-print-pricing.ts}
 */

export const SCP_PRINT_PRICING_VERSION = 1 as const

export type ScpPrintSizeId = "up_to_a6" | "up_to_a4" | "up_to_a3" | "oversize"

export type ScpQuantityTier = {
  label: string
  minQuantity: number
  maxQuantity?: number
}

/** Matches bulk-tier ladder used across spreadsheet sync + storefront. */
export const SCP_BLANK_ALIGNED_QUANTITY_TIERS: ScpQuantityTier[] = [
  { label: "Qty 1–9", minQuantity: 1, maxQuantity: 9 },
  { label: "Qty 10–19", minQuantity: 10, maxQuantity: 19 },
  { label: "Qty 20–49", minQuantity: 20, maxQuantity: 49 },
  { label: "Qty 50–99", minQuantity: 50, maxQuantity: 99 },
  { label: "Qty 100+", minQuantity: 100 },
]

/** Print sizes from SCP list (dims match PDF). */
export const SCP_PRINT_SIZE_OPTIONS: Array<{
  id: ScpPrintSizeId
  label: string
  dimensionsLabel: string
}> = [
  { id: "up_to_a6", label: "Up to A6", dimensionsLabel: "10×15 cm" },
  { id: "up_to_a4", label: "Up to A4", dimensionsLabel: "21×30 cm" },
  { id: "up_to_a3", label: "Up to A3", dimensionsLabel: "29×42 cm" },
  { id: "oversize", label: "Oversize", dimensionsLabel: "38×48 cm" },
]

/**
 * Per-print-location unit prices by tier index (0–4), AUD major units (same scale as Medusa `price.amount`).
 */
// 2026-08 repricing: anchored to true channel costs (DSP $38/lm roll or
// Supacolour transfer + press labour) so every cell clears its cost floor —
// the old card sold A3/Oversize below bought-in transfer cost.
export const SCP_PRINT_UNIT_MATRIX: Record<ScpPrintSizeId, readonly [number, number, number, number, number]> =
  {
    up_to_a6: [8.5, 7.5, 6.5, 6, 5.5],
    up_to_a4: [11.5, 10.5, 9.5, 9.5, 9],
    up_to_a3: [16, 15, 14.5, 14.5, 14.5],
    oversize: [18, 17, 16.5, 16, 16],
  }

/**
 * True physical box per size (cm). Mirror of the storefront's
 * `SCP_PRINT_SIZE_TRUE_CM` (customizer/lib/print-spec.ts) — the customizer
 * auto-snaps a print's tier from these, and the server re-snaps from the
 * same numbers so a client can't declare an A3 print as A6 (review 1-3).
 */
export const SCP_PRINT_SIZE_TRUE_CM: Record<ScpPrintSizeId, { width: number; height: number }> = {
  up_to_a6: { width: 10, height: 15 },
  up_to_a4: { width: 21, height: 30 },
  up_to_a3: { width: 29, height: 42 },
  oversize: { width: 38, height: 48 },
}

const SCP_PRINT_SIZE_ORDER: ScpPrintSizeId[] = ["up_to_a6", "up_to_a4", "up_to_a3", "oversize"]

/**
 * Smallest size whose box contains the print, either way up (a 14 × 4 cm
 * wordmark is A6 turned sideways); oversize when nothing does.
 */
export function snapScpPrintSizeForCm(cm: { width: number; height: number }): ScpPrintSizeId {
  const [short, long] = [Math.min(cm.width, cm.height), Math.max(cm.width, cm.height)]
  return (
    SCP_PRINT_SIZE_ORDER.find(
      (id) => short <= SCP_PRINT_SIZE_TRUE_CM[id].width && long <= SCP_PRINT_SIZE_TRUE_CM[id].height
    ) ?? "oversize"
  )
}

export const largerScpPrintSize = (a: ScpPrintSizeId, b: ScpPrintSizeId): ScpPrintSizeId =>
  SCP_PRINT_SIZE_ORDER.indexOf(a) >= SCP_PRINT_SIZE_ORDER.indexOf(b) ? a : b

/**
 * The size a location prices at: its declared tier (or the line's selected
 * size), floored by the tier its stated dimensions need. Never snaps DOWN —
 * a customer who picked a bigger tier than the artwork needs pays for it.
 * ponytail: `approxCm` is itself client-written; this only forces the two
 * fields to agree with what staff see on the order sheet. Re-measuring from
 * the rendered print PNG is the upgrade path.
 */
export const requestedScpPrintSizeForLocation = (
  location: DecoratedLocation,
  selectedPrintSizeId: ScpPrintSizeId
): ScpPrintSizeId => {
  const requested = location.printSizeId ?? selectedPrintSizeId
  return location.minPrintSizeId ? largerScpPrintSize(requested, location.minPrintSizeId) : requested
}

export const DEFAULT_SCP_PRINT_SIZE_ID: ScpPrintSizeId = "up_to_a6"
// Only the printed neck tag is physically constrained to A6 server-side.
// Sleeve sizing is enforced by the storefront UI based on garment type
// (short sleeves stay A6-only; long sleeves accept up to A3).
export const SCP_A6_ONLY_SIDES = new Set(["printed_tag"])

export const isScpPrintSizeId = (value: unknown): value is ScpPrintSizeId =>
  value === "up_to_a6" || value === "up_to_a4" || value === "up_to_a3" || value === "oversize"

export function resolveScpTierIndexForQuantity(quantity: number): number {
  const safeQty = Math.max(1, Math.floor(quantity || 1))
  const idx = SCP_BLANK_ALIGNED_QUANTITY_TIERS.findIndex((tier) => {
    if (safeQty < tier.minQuantity) {
      return false
    }
    if (typeof tier.maxQuantity === "number" && safeQty > tier.maxQuantity) {
      return false
    }
    return true
  })
  return idx >= 0 ? idx : SCP_BLANK_ALIGNED_QUANTITY_TIERS.length - 1
}

export function scpPrintUnitMajorForTier(printSizeId: ScpPrintSizeId, tierIndex: number): number {
  const row = SCP_PRINT_UNIT_MATRIX[printSizeId]
  const idx = Math.min(Math.max(0, tierIndex), row.length - 1)
  return row[idx] ?? 0
}

export function resolveScpPrintSizeForSide(side: string, selectedPrintSizeId: ScpPrintSizeId): ScpPrintSizeId {
  return SCP_A6_ONLY_SIDES.has(side) ? "up_to_a6" : selectedPrintSizeId
}

/**
 * Per-side pricing with forced A6 for sleeves + printed_tag.
 */
export function scpPrintTotalMajorPerGarmentForSides(args: {
  selectedPrintSizeId: ScpPrintSizeId
  tierIndex: number
  decoratedSides: string[]
}): number {
  const sides = args.decoratedSides.filter((s) => typeof s === "string" && s.trim().length > 0)
  if (!sides.length) {
    return 0
  }
  const total = sides.reduce((sum, side) => {
    const sizeId = resolveScpPrintSizeForSide(side, args.selectedPrintSizeId)
    return sum + scpPrintUnitMajorForTier(sizeId, args.tierIndex)
  }, 0)
  return Math.round(total * 100) / 100
}

export type CustomizerDesignLike = {
  artifacts?: unknown
  type?: unknown
}

export type DecoratedLocation = {
  side: string
  printSizeId?: ScpPrintSizeId
  /** Tier the print's stated `approxCm` needs — a floor on `printSizeId`. */
  minPrintSizeId?: ScpPrintSizeId
}

const maybePrintSizeId = (value: unknown): ScpPrintSizeId | undefined =>
  isScpPrintSizeId(value) ? value : undefined

export function decoratedLocationsFromLineMetadata(
  metadata: Record<string, unknown> | null | undefined
): DecoratedLocation[] {
  if (!metadata || typeof metadata !== "object") {
    return []
  }
  const customizerDesign = metadata.customizerDesign as
    | (CustomizerDesignLike & { prints?: unknown })
    | undefined
  // Per-print pricing path. Each print is one transfer, charged at its own
  // size tier — produces one DecoratedLocation per print so callers can sum
  // unit prices over them directly. New cart payloads use this branch; old
  // ones (artifacts-only) keep working through the legacy fallback below.
  if (customizerDesign && Array.isArray(customizerDesign.prints)) {
    const fromPrints = customizerDesign.prints
      .map((p) => {
        const side = (p as { side?: unknown })?.side
        if (typeof side !== "string" || !side.trim().length) return null
        const printSizeId = maybePrintSizeId((p as { sizeId?: unknown })?.sizeId)
        const cm = (p as { approxCm?: { width?: unknown; height?: unknown } })?.approxCm
        const width = Number(cm?.width)
        const height = Number(cm?.height)
        return {
          side: side.trim(),
          printSizeId,
          minPrintSizeId:
            width > 0 && height > 0 ? snapScpPrintSizeForCm({ width, height }) : undefined,
        } satisfies DecoratedLocation
      })
      .filter((location) => location !== null) as DecoratedLocation[]
    if (fromPrints.length > 0) return fromPrints
  }
  if (customizerDesign && Array.isArray(customizerDesign.artifacts)) {
    return customizerDesign.artifacts
      .map((a) => {
        const side = (a as { side?: unknown })?.side
        if (typeof side !== "string" || !side.trim().length) {
          return null
        }
        const artifactSize = maybePrintSizeId((a as { print_size_id?: unknown })?.print_size_id)
        return {
          side: side.trim(),
          printSizeId: artifactSize,
        } satisfies DecoratedLocation
      })
      .filter((location) => location !== null) as DecoratedLocation[]
  }
  const placement = metadata.printPlacement as Record<string, unknown> | undefined
  const side = placement?.side
  if (placement && typeof placement === "object" && typeof side === "string" && side.trim()) {
    return [{ side: side.trim() }]
  }
  if (placement && typeof placement === "object") {
    return [{ side: "front" }]
  }
  return []
}

export function decoratedSidesFromLineMetadata(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  // Dedupe — multiple prints on the same side count as one decorated side
  // for callers that just want "is anything decorated and where".
  const seen = new Set<string>()
  const ordered: string[] = []
  decoratedLocationsFromLineMetadata(metadata).forEach((l) => {
    if (!seen.has(l.side)) {
      seen.add(l.side)
      ordered.push(l.side)
    }
  })
  return ordered
}

export function scpPrintTotalMajorFromLocations(args: {
  selectedPrintSizeId: ScpPrintSizeId
  tierIndex: number
  locations: DecoratedLocation[]
}): number {
  if (!args.locations.length) {
    return 0
  }
  const total = args.locations.reduce((sum, location) => {
    const requested = requestedScpPrintSizeForLocation(location, args.selectedPrintSizeId)
    const sizeId = resolveScpPrintSizeForSide(location.side, requested)
    return sum + scpPrintUnitMajorForTier(sizeId, args.tierIndex)
  }, 0)
  return Math.round(total * 100) / 100
}
