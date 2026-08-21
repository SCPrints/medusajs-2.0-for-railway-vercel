import {
  resolveScpPrintSizeForSide,
  resolveScpTierIndexForQuantity,
  scpPrintTotalMajorPerGarment,
  scpPrintTotalMajorPerGarmentForSides,
  scpPrintUnitMajorForTier,
} from "./scp-dtf-print-pricing"
import { calculatePrice as calculateEmbroideryPrice } from "@modules/embroidery/lib/pricing"
import { SCREEN_MIN_QUANTITY, screenUnitMajor } from "./scp-screen-print-pricing"
import { BulkPricingTier, PricingBreakdown, PricingInput } from "./types"

/**
 * NOTE: input/output field names retain the `Cents` suffix for compatibility, but values are now
 * **major units** (decimal dollars) — same scale as Medusa 2.x `price.amount` and the rest of the
 * storefront. Internal math rounds to 2dp to preserve cent precision.
 */

const SIDE_SURCHARGE = 2.5

const round2 = (n: number) => Math.round(n * 100) / 100

const getQuantityDiscountRate = (quantity: number) => {
  if (quantity >= 100) {
    return 0.2
  }

  if (quantity >= 50) {
    return 0.15
  }

  if (quantity >= 20) {
    return 0.1
  }

  if (quantity >= 10) {
    return 0.05
  }

  return 0
}

const normalizeTiers = (tiers?: BulkPricingTier[]) =>
  (tiers ?? [])
    .filter((tier) => Number.isFinite(tier.minQuantity) && Number.isFinite(tier.amountCents))
    .map((tier) => ({
      minQuantity: Math.max(1, Math.floor(tier.minQuantity)),
      maxQuantity:
        typeof tier.maxQuantity === "number" && Number.isFinite(tier.maxQuantity)
          ? Math.max(1, Math.floor(tier.maxQuantity))
          : undefined,
      amountCents: Math.max(0, round2(tier.amountCents)),
    }))
    .sort((a, b) => a.minQuantity - b.minQuantity)

const resolveBulkTierForQuantity = (tiers: BulkPricingTier[], quantity: number) =>
  tiers.find((tier) => {
    if (quantity < tier.minQuantity) {
      return false
    }
    if (typeof tier.maxQuantity === "number" && quantity > tier.maxQuantity) {
      return false
    }
    return true
  }) ?? tiers[tiers.length - 1]

export const calculatePricing = ({
  basePriceCents,
  decoratedSidesCount,
  decoratedSides: decoratedSidesInput,
  totalQuantity,
  bulkPricingTiers,
  scpPrint,
  prints: printsInput,
  tierUnitCents,
  embroidery,
  screen,
  screenHeavyGarment,
}: PricingInput): PricingBreakdown => {
  const safeQuantity = Math.max(1, Math.floor(totalQuantity || 1))

  // Embroidered and screen-printed sides are priced by their own rate cards,
  // never the DTF print matrix. Strip them from every print-pricing input
  // here (the chokepoint) so no caller can accidentally double-price or
  // mis-price a non-DTF side.
  const nonDtfSideSet = new Set([
    ...(embroidery ?? []).map((e) => e.side),
    ...(screen ?? []).map((s) => s.side),
  ])
  const decoratedSides = nonDtfSideSet.size
    ? decoratedSidesInput?.filter((side) => !nonDtfSideSet.has(side))
    : decoratedSidesInput
  const prints = nonDtfSideSet.size
    ? printsInput?.filter((p) => !nonDtfSideSet.has(p.side))
    : printsInput
  const decoratedSidesResolved = Math.max(
    0,
    Math.floor(decoratedSidesCount || 0) - nonDtfSideSet.size
  )
  let sideSurchargePerUnit =
    decoratedSidesResolved > 0 ? round2(decoratedSidesResolved * SIDE_SURCHARGE) : 0

  if (scpPrint && decoratedSidesResolved > 0) {
    const tierIndex = resolveScpTierIndexForQuantity(safeQuantity)
    sideSurchargePerUnit = Array.isArray(decoratedSides) && decoratedSides.length
      ? scpPrintTotalMajorPerGarmentForSides({
          selectedPrintSizeId: scpPrint.printSizeId,
          tierIndex,
          decoratedSides,
        })
      : scpPrintTotalMajorPerGarment({
          printSizeId: scpPrint.printSizeId,
          tierIndex,
          decoratedSidesCount: decoratedSidesResolved,
        })
  }
  // Per-print pricing takes precedence whenever the customizer hands us a
  // populated `prints` list. Each entry is one transfer charged at its own
  // size tier — that's how production actually costs (one film per object).
  // The legacy `decoratedSides` × global-size path stays in place for older
  // saved-design / cart payloads that still use the single-size model.
  if (Array.isArray(prints) && prints.length > 0) {
    const tierIndex = resolveScpTierIndexForQuantity(safeQuantity)
    sideSurchargePerUnit = round2(
      prints.reduce((sum, print) => {
        const sizeId = resolveScpPrintSizeForSide(print.side, print.sizeId)
        return sum + scpPrintUnitMajorForTier(sizeId, tierIndex)
      }, 0)
    )
  }
  // A tier customer pays a flat garment price (cost × multiplier) that replaces
  // the quantity ladder entirely — it's cheaper than any bulk band, so there's
  // no bulk pricing and no quantity discount. The decoration surcharge above
  // still applies (the tier covers the garment, not the print/embroidery).
  const tierActive =
    typeof tierUnitCents === "number" && Number.isFinite(tierUnitCents) && tierUnitCents >= 0

  const normalizedTiers = tierActive ? [] : normalizeTiers(bulkPricingTiers)
  const activeBulkTier = normalizedTiers.length
    ? resolveBulkTierForQuantity(normalizedTiers, safeQuantity)
    : undefined
  const fallbackBaseUnit = Math.max(0, round2(basePriceCents))
  const baseUnit = tierActive
    ? Math.max(0, round2(tierUnitCents as number))
    : activeBulkTier?.amountCents ?? fallbackBaseUnit
  const beforeDiscountUnit = round2(baseUnit + sideSurchargePerUnit)
  const firstTierBase = normalizedTiers[0]?.amountCents ?? baseUnit
  const quantityDiscountRate = tierActive
    ? 0
    : normalizedTiers.length
    ? firstTierBase > baseUnit
      ? (firstTierBase - baseUnit) / firstTierBase
      : 0
    : getQuantityDiscountRate(safeQuantity)
  // Keep the precise per-unit value around so total = unit × qty is computed
  // before rounding. Rounding the unit to 2dp first and then multiplying
  // accumulates cents of error across large quantities (e.g. 23.375 × 50
  // collapses to 23.38 × 50 = 1169 instead of the actual 1168.75).
  const preciseDiscountedUnit =
    tierActive || normalizedTiers.length
      ? beforeDiscountUnit
      : beforeDiscountUnit * (1 - quantityDiscountRate)

  // Embroidery add-on: stitch-tier price + digitizing amortised over the
  // quantity. Added AFTER the quantity discount, mirroring the backend charge
  // (computeScpLineDescriptor never discounts decoration). Sides above the
  // auto-priced stitch cap contribute $0 and are flagged for the quote path.
  //
  // Digitizing is charged per DISTINCT FILE, not per side: the same artwork
  // at the same size (within the ~5% machine resize tolerance) shares one
  // digitized file across sides, so one $60 fee — a >5% resize is a new file
  // and a new fee. Mirrors clusterDigitizingEntries in
  // backend/src/lib/scp-decoration-pricing.ts (locked by pricing-mirror.spec).
  const dimsClose = (a: number, b: number) =>
    a === b || (a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) <= 0.05)
  type EmbCluster = { artworkKey: string; widthMm: number; heightMm: number; feeCharged: boolean }
  const embClusters: EmbCluster[] = []
  let embroideryPerUnit = 0
  const embroideryRows: NonNullable<PricingBreakdown["embroideryRows"]> = []
  for (const spec of embroidery ?? []) {
    const stitchCount = Math.max(0, Math.floor(spec.stitchCount || 0))
    if (stitchCount <= 0) continue
    const breakdown = calculateEmbroideryPrice({
      stitchCount,
      quantity: safeQuantity,
      includeDigitizing: spec.includeDigitizingFee !== false,
    })

    let unit = 0
    if (!breakdown.requiresQuote) {
      // Attribute the digitizing fee once per distinct file. Sides with no
      // artwork key never cluster together (each is its own file — fail
      // toward charging, same as the backend).
      let feeMajor = 0
      if (breakdown.digitizingFee > 0) {
        const widthMm = Math.max(0, spec.widthMm ?? 0)
        const heightMm = Math.max(0, spec.heightMm ?? 0)
        const cluster = spec.artworkKey
          ? embClusters.find(
              (c) =>
                c.artworkKey === spec.artworkKey &&
                dimsClose(c.widthMm, widthMm) &&
                dimsClose(c.heightMm, heightMm)
            )
          : undefined
        if (cluster) {
          if (!cluster.feeCharged) {
            cluster.feeCharged = true
            feeMajor = breakdown.digitizingFee
          }
        } else {
          embClusters.push({
            artworkKey: spec.artworkKey ?? `side:${spec.side}`,
            widthMm,
            heightMm,
            feeCharged: true,
          })
          feeMajor = breakdown.digitizingFee
        }
      }
      unit = round2(breakdown.unitDecorationPrice + feeMajor / safeQuantity)
    }
    embroideryPerUnit = round2(embroideryPerUnit + unit)
    embroideryRows.push({
      side: spec.side,
      stitchCount,
      unitPriceCents: unit,
      requiresQuote: breakdown.requiresQuote,
    })
  }

  // Screen-print add-on: colour-tier unit per screen side, added AFTER the
  // quantity discount like embroidery. Setup fees are deliberately excluded —
  // they're a separate cart line (one per screen), not a per-unit charge.
  let screenPerUnit = 0
  const screenRows: NonNullable<PricingBreakdown["screenRows"]> = []
  for (const spec of screen ?? []) {
    const { unitMajor, effectiveColours } = screenUnitMajor({
      quantity: safeQuantity,
      colours: spec.colours,
      darkGarment: spec.darkGarment,
      heavyGarment: screenHeavyGarment,
    })
    screenPerUnit = round2(screenPerUnit + unitMajor)
    screenRows.push({
      side: spec.side,
      colours: Math.max(1, Math.round(spec.colours || 1)),
      effectiveColours,
      unitPriceCents: unitMajor,
    })
  }
  const screenBelowMinimum = screenRows.length > 0 && safeQuantity < SCREEN_MIN_QUANTITY

  const preciseUnitWithEmbroidery = preciseDiscountedUnit + embroideryPerUnit + screenPerUnit
  const discountedUnitPriceCents = round2(preciseUnitWithEmbroidery)
  const sideSurchargeTotalCents = round2(sideSurchargePerUnit * safeQuantity)
  const totalPriceCents = round2(preciseUnitWithEmbroidery * safeQuantity)

  return {
    baseUnitPriceCents: baseUnit,
    sideSurchargePerUnitCents: sideSurchargePerUnit,
    sideSurchargeTotalCents,
    quantityDiscountRate,
    hasBulkPricing: !tierActive && normalizedTiers.length > 0,
    activeBulkTier,
    bulkPricingTiers: normalizedTiers.length ? normalizedTiers : undefined,
    discountedUnitPriceCents,
    totalPriceCents,
    tierPriceApplied: tierActive,
    embroideryPerUnitCents: embroideryPerUnit,
    embroideryRows: embroideryRows.length ? embroideryRows : undefined,
    screenPerUnitCents: screenPerUnit,
    screenRows: screenRows.length ? screenRows : undefined,
    screenBelowMinimum: screenBelowMinimum || undefined,
  }
}
