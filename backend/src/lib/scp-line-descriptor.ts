/**
 * Pure per-line pricing + metadata builder for the SCP cart flow. Used by
 * both POST /store/carts/:id/scp-line-items (single-line, kept for
 * backwards-compat) and POST /store/carts/:id/scp-line-items-batch (multi-
 * line, used by the bulk-order grid when the customer adds 100+ rows at
 * once).
 *
 * The single-line route used to inline this block; lifting it here lets the
 * batch route reuse the exact same math without duplicating ~200 lines of
 * pricing logic. Behaviour is byte-identical to the original inline version.
 */
import { MedusaError } from "@medusajs/framework/utils"

import {
  SCP_PRINT_PRICING_VERSION,
  SCP_BLANK_ALIGNED_QUANTITY_TIERS,
  decoratedLocationsFromLineMetadata,
  decoratedSidesFromLineMetadata,
  isScpPrintSizeId,
  resolveScpTierIndexForQuantity,
  scpPrintTotalMajorFromLocations,
  scpPrintTotalMajorPerGarmentForSides,
  type ScpPrintSizeId,
} from "./scp-dtf-print-pricing"
import {
  EMBROIDERY_PRICING_VERSION,
  MAX_AUTO_PRICED_STITCHES,
  calculateEmbroideryUnitPriceMajor,
} from "./embroidery-pricing"
import {
  RemoteJoinerGraphLike,
  resolveGarmentUnitAmountMajor,
} from "./scp-resolve-garment-unit-price"

export type CartForLineDescriptor = {
  id?: string
  currency_code?: string | null
  region_id?: string | null
  sales_channel_id?: string | null
  region?: { currency_code?: string | null } | null
}

export type EmbroideryBreakdownEntry = {
  side: string
  stitchCount: number
  unitDecorationMajor: number
  digitizingFeeMajor: number
  unitPriceMajor: number
  requiresQuote: boolean
}

export type ScpLineDescriptor = {
  variantId: string
  quantity: number
  unitPriceMajor: number
  metadata: Record<string, unknown>
  printSizeId: ScpPrintSizeId
  tierIndex: number
  decoratedSides: string[]
  printSides: string[]
  embroiderySides: string[]
  embroideryBreakdown: EmbroideryBreakdownEntry[]
}

export type ScpLineDescriptorInput = {
  variantId: string
  quantity: number
  metadata: Record<string, unknown> | undefined
  printSizeIdRaw: string
  cart: CartForLineDescriptor
  query: RemoteJoinerGraphLike
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Validate + price a single SCP line. Throws MedusaError on invalid input;
 * caller is responsible for the cart + variant existence checks (this helper
 * trusts that `cart` is the already-resolved cart row).
 */
export async function computeScpLineDescriptor(
  input: ScpLineDescriptorInput
): Promise<ScpLineDescriptor> {
  const { variantId, quantity, metadata: incomingMetadata, printSizeIdRaw, cart, query } = input

  if (!isScpPrintSizeId(printSizeIdRaw)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown print_size_id "${printSizeIdRaw}". Expected one of: up_to_a6, up_to_a4, up_to_a3, oversize.`
    )
  }
  const printSizeId: ScpPrintSizeId = printSizeIdRaw

  const mergedMetadata: Record<string, unknown> = {
    ...(incomingMetadata ?? {}),
  }

  const decoratedSides = decoratedSidesFromLineMetadata(mergedMetadata)
  if (decoratedSides.length < 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "SCP cart pricing requires at least one decorated print location (customizerDesign.artifacts or printPlacement)."
    )
  }

  const tierIndex = resolveScpTierIndexForQuantity(quantity)
  const decoratedLocations = decoratedLocationsFromLineMetadata(mergedMetadata)

  // Read per-side decoration methods (v3 schema). v2 metadata has no entries,
  // so all sides default to "print" — preserves legacy behaviour.
  const customizerDesignForMethods =
    typeof mergedMetadata.customizerDesign === "object" &&
    mergedMetadata.customizerDesign !== null
      ? (mergedMetadata.customizerDesign as Record<string, unknown>)
      : {}
  const sideDecorationMethods =
    typeof customizerDesignForMethods.sideDecorationMethods === "object" &&
    customizerDesignForMethods.sideDecorationMethods !== null
      ? (customizerDesignForMethods.sideDecorationMethods as Record<string, string>)
      : {}
  const sideEmbroideryConfigs =
    typeof customizerDesignForMethods.sideEmbroideryConfigs === "object" &&
    customizerDesignForMethods.sideEmbroideryConfigs !== null
      ? (customizerDesignForMethods.sideEmbroideryConfigs as Record<
          string,
          { stitchCount?: number; includeDigitizingFee?: boolean }
        >)
      : {}

  const printSides = decoratedSides.filter(
    (side) => (sideDecorationMethods[side] ?? "print") === "print"
  )
  const embroiderySides = decoratedSides.filter(
    (side) => sideDecorationMethods[side] === "embroidery"
  )

  const printLocations = decoratedLocations.filter((loc) => {
    const side = (loc as { side?: string }).side
    return !side || (sideDecorationMethods[side] ?? "print") === "print"
  })
  const printTotalMajor =
    printSides.length === 0
      ? 0
      : printLocations.length > 0
      ? scpPrintTotalMajorFromLocations({
          selectedPrintSizeId: printSizeId,
          tierIndex,
          locations: printLocations,
        })
      : scpPrintTotalMajorPerGarmentForSides({
          selectedPrintSizeId: printSizeId,
          tierIndex,
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
      quantity,
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

  const garmentMajor = await resolveGarmentUnitAmountMajor({
    query,
    variantId,
    quantity,
    cart,
  })

  const unitPriceMajor = round2(
    Math.max(0, garmentMajor) +
      Math.max(0, printTotalMajor) +
      Math.max(0, embroideryTotalMajor)
  )

  const customizerDesignRaw = mergedMetadata.customizerDesign
  const customizerDesign =
    typeof customizerDesignRaw === "object" && customizerDesignRaw !== null
      ? (customizerDesignRaw as Record<string, unknown>)
      : {}

  const pricingRaw = customizerDesign.pricing
  const pricingExisting =
    typeof pricingRaw === "object" && pricingRaw !== null
      ? (pricingRaw as Record<string, unknown>)
      : {}

  const mergedCustomizerDesign: Record<string, unknown> = {
    ...customizerDesign,
    pricing: {
      ...pricingExisting,
      server: {
        mode: embroiderySides.length > 0 ? "scp_dtf_mixed" : "scp_dtf",
        version: SCP_PRINT_PRICING_VERSION,
        embroidery_version:
          embroiderySides.length > 0 ? EMBROIDERY_PRICING_VERSION : undefined,
        print_size_id: printSizeId,
        tier_index: tierIndex,
        quantity_tier_label: SCP_BLANK_ALIGNED_QUANTITY_TIERS[tierIndex]?.label ?? null,
        decorated_sides: decoratedSides.length,
        decorated_side_keys: decoratedSides,
        decorated_locations: decoratedLocations,
        print_side_keys: printSides,
        embroidery_side_keys: embroiderySides,
        garment_unit_major: garmentMajor,
        print_total_major_per_garment: printTotalMajor,
        embroidery_total_major_per_garment: embroideryTotalMajor,
        embroidery_breakdown: embroideryBreakdown,
        unit_price_major: unitPriceMajor,
      },
    },
  }

  mergedMetadata.customizerDesign = mergedCustomizerDesign

  return {
    variantId,
    quantity,
    unitPriceMajor,
    metadata: mergedMetadata,
    printSizeId,
    tierIndex,
    decoratedSides,
    printSides,
    embroiderySides,
    embroideryBreakdown,
  }
}
