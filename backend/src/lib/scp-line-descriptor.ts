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
  type ScpPrintSizeId,
} from "./scp-dtf-print-pricing"
import {
  EMBROIDERY_PRICING_VERSION,
  MAX_AUTO_PRICED_STITCHES,
} from "./embroidery-pricing"
import { SCP_SCREEN_PRICING_VERSION } from "./scp-screen-print-pricing"
import { SCP_SUPACOLOUR_PRICING_VERSION } from "./scp-supacolour-pricing"
import {
  computeDecorationTotals,
  resolveDecorationProductFlags,
  type EmbroideryBreakdownEntry,
  type ScreenBreakdownEntry,
} from "./scp-decoration-pricing"
import {
  RemoteJoinerGraphLike,
  resolveGarmentUnitAmountMajor,
} from "./scp-resolve-garment-unit-price"
import type { Tier } from "./customer-tiers"

export type { EmbroideryBreakdownEntry, ScreenBreakdownEntry }

export type CartForLineDescriptor = {
  id?: string
  currency_code?: string | null
  region_id?: string | null
  sales_channel_id?: string | null
  region?: { currency_code?: string | null } | null
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
  screenSides: string[]
  screenBreakdown: ScreenBreakdownEntry[]
}

export type ScpLineDescriptorInput = {
  variantId: string
  quantity: number
  metadata: Record<string, unknown> | undefined
  printSizeIdRaw: string
  cart: CartForLineDescriptor
  query: RemoteJoinerGraphLike
  /** Cart customer's pricing tier — flat garment price replaces the ladder. */
  tier?: Tier | null
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
  const { variantId, quantity, metadata: incomingMetadata, printSizeIdRaw, cart, query, tier } = input

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

  // Canonical decoration math — shared with the update-design route and the
  // cart-wide recompute (see scp-decoration-pricing.ts). Add-path semantics:
  // every quantity is the line's own quantity.
  let totals = computeDecorationTotals({
    metadata: mergedMetadata,
    printSizeId,
    printTierQuantity: quantity,
    embroideryQuantity: quantity,
    screenHeavyGarment: false,
  })
  // Product-level pricing flags (metadata.screen_heavy + the full-colour
  // pricing class) are staff-controlled and resolved SERVER-SIDE so the
  // client can't omit them to shave the price. One lookup covers both; only
  // needed when a side actually prices through screen or the print matrix.
  let fullColourCard: "dtf" | "supacolour" = "dtf"
  if (totals.screenSides.length > 0 || totals.printSides.length > 0) {
    const flags = await resolveDecorationProductFlags(query, variantId)
    fullColourCard =
      flags.decorationPricingClass === "supacolour" ? "supacolour" : "dtf"
    if (flags.screenHeavy || fullColourCard === "supacolour") {
      totals = computeDecorationTotals({
        metadata: mergedMetadata,
        printSizeId,
        printTierQuantity: quantity,
        embroideryQuantity: quantity,
        screenHeavyGarment: flags.screenHeavy,
        fullColourCard,
      })
    }
  }

  // A Supacolour garment carrying an oversize full-colour print has no
  // auto-price (no Supacolour size that big) — reject rather than sell the
  // print at $0. The storefront disables the oversize tile on these garments.
  if (totals.supacolourQuoteSides.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Oversize prints aren't available on this fabric — ${totals.supacolourQuoteSides
        .map((s) => s.replace(/_/g, " "))
        .join(", ")} needs a manual quote. Choose up to A3 or contact us.`
    )
  }
  const {
    printSides,
    embroiderySides,
    screenSides,
    printTotalMajor,
    embroideryTotalMajor,
    embroideryBreakdown,
    screenTotalMajor,
    screenBreakdown,
  } = totals

  // An embroidery side with no stitch count would price its decoration at
  // $0 — reject rather than sell free embroidery. The customizer forces the
  // embroidery config panel before enabling add-to-cart, so a customer only
  // sees this if the client-side gate was bypassed.
  if (totals.unconfiguredEmbroiderySides.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Embroidery size not confirmed for: ${totals.unconfiguredEmbroiderySides.join(", ")}. ` +
        `Open the embroidery settings for each embroidered position and confirm the size before adding to cart.`
    )
  }

  // POA guard: an over-cap embroidery side prices at $0 (requiresQuote) — never
  // let it into the cart. One guard here covers both add routes (scp-line-items
  // and scp-line-items-batch); scp-update-design carries its own mirror.
  const poaSides = embroideryBreakdown
    .filter((b) => b.requiresQuote)
    .map((b) => b.side.replace(/_/g, " "))
  if (poaSides.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Embroidery on ${poaSides.join(", ")} is over ${MAX_AUTO_PRICED_STITCHES.toLocaleString()} stitches — ` +
        `priced on application. Request a quote instead of adding to cart.`
    )
  }

  const garmentMajor = await resolveGarmentUnitAmountMajor({
    query,
    variantId,
    quantity,
    cart,
    tier,
  })

  const unitPriceMajor = round2(
    Math.max(0, garmentMajor) +
      Math.max(0, printTotalMajor) +
      Math.max(0, embroideryTotalMajor) +
      Math.max(0, screenTotalMajor)
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
        mode:
          embroiderySides.length > 0 || screenSides.length > 0
            ? "scp_dtf_mixed"
            : "scp_dtf",
        version: SCP_PRINT_PRICING_VERSION,
        embroidery_version:
          embroiderySides.length > 0 ? EMBROIDERY_PRICING_VERSION : undefined,
        screen_version:
          screenSides.length > 0 ? SCP_SCREEN_PRICING_VERSION : undefined,
        full_colour_card: fullColourCard === "supacolour" ? "supacolour" : undefined,
        supacolour_version:
          fullColourCard === "supacolour" ? SCP_SUPACOLOUR_PRICING_VERSION : undefined,
        print_size_id: printSizeId,
        tier_index: tierIndex,
        quantity_tier_label: SCP_BLANK_ALIGNED_QUANTITY_TIERS[tierIndex]?.label ?? null,
        decorated_sides: decoratedSides.length,
        decorated_side_keys: decoratedSides,
        decorated_locations: decoratedLocations,
        print_side_keys: printSides,
        embroidery_side_keys: embroiderySides,
        screen_side_keys: screenSides,
        garment_unit_major: garmentMajor,
        print_total_major_per_garment: printTotalMajor,
        embroidery_total_major_per_garment: embroideryTotalMajor,
        embroidery_breakdown: embroideryBreakdown,
        screen_total_major_per_garment: screenTotalMajor,
        screen_breakdown: screenBreakdown,
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
    screenSides,
    screenBreakdown,
  }
}
