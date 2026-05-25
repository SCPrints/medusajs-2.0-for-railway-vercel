import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "zod"

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
} from "../../../../../lib/scp-dtf-print-pricing"
import {
  EMBROIDERY_PRICING_VERSION,
  MAX_AUTO_PRICED_STITCHES,
  calculateEmbroideryUnitPriceMajor,
} from "../../../../../lib/embroidery-pricing"
import {
  RemoteJoinerGraphLike,
  resolveGarmentUnitAmountMajor,
} from "../../../../../lib/scp-resolve-garment-unit-price"
import { recomputeScpCartPricing } from "../../../../../lib/recompute-scp-cart-pricing"
import { getPostHog } from "../../../../../lib/posthog"

const cartParamsSchema = z.object({
  id: z.string().min(1),
})

const scpPrintSchema = z.object({
  version: z.number().int().optional(),
  print_size_id: z.string().min(1).transform((v) => v.trim()),
})

const bodySchema = z.object({
  line_ids: z.array(z.string().min(1)).min(1).max(200),
  // Full new CustomizerMetadata (excluding variantId — variantId stays on
  // the cart line itself). Same shape the customizer sends to scp-line-items
  // under `metadata.customizerDesign`, minted by buildCustomizerMetadataBase.
  customizer_design: z.record(z.string(), z.unknown()),
  scp_print: scpPrintSchema,
  // Optional carry-overs. When present, written onto each line's top-level
  // metadata alongside customizerDesign. Same fields the scp-line-items
  // route stamps so cart UI fallback paths keep working.
  product_handle: z.string().optional(),
  product_title: z.string().optional(),
})

/**
 * POST /store/carts/:id/scp-update-design
 *
 * Updates the customizerDesign metadata on a set of existing cart lines —
 * intended for the "Edit design from cart" flow where a customer changes the
 * artwork/text/position on lines they've already added, without touching
 * quantities, variants, or line identities. The original `cart_line_item.id`
 * values are preserved (no delete + recreate), so created_at, manual adjust-
 * ments, and downstream references stay intact.
 *
 * Pricing handling:
 *   1. Each line's `customizerDesign.pricing.server` block is rewritten with
 *      the new design's decorated sides + chosen print size.
 *   2. `updateLineItemInCartWorkflow` is called per line with the rewritten
 *      metadata.
 *   3. `recomputeScpCartPricing` runs once at the end so every line's
 *      `unit_price` is recalculated against the new design + aggregated
 *      cart-wide quantity. The recompute is the source of truth for prices.
 *
 * Idempotency: re-calling with the same body twice does no harm. The
 * second call writes identical metadata; recompute then no-ops because
 * unit_prices are already aligned.
 *
 * Auth: relies on the standard store-cart access (publishable key + cart id).
 * No customer auth is required — the cart id itself is the capability.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    return await scpUpdateDesignPostHandler(req, res)
  } catch (error) {
    if (error instanceof MedusaError) {
      throw error
    }
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === "string"
        ? error
        : "no detail"
    // eslint-disable-next-line no-console
    console.error("scp-update-design handler failed", error)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `SCP design update failed: ${detail}`
    )
  }
}

async function scpUpdateDesignPostHandler(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const parsedParams = cartParamsSchema.safeParse(req.params ?? {})
  if (!parsedParams.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid cart id: ${parsedParams.error.message}`
    )
  }

  const parsedBody = bodySchema.safeParse(req.body ?? {})
  if (!parsedBody.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid payload: ${parsedBody.error.issues
        .map((i) => i.message)
        .join(", ")}`
    )
  }

  const cartId = parsedParams.data.id
  const {
    line_ids: lineIds,
    customizer_design: newCustomizerDesign,
    scp_print,
    product_handle,
    product_title,
  } = parsedBody.data

  const printSizeRaw = scp_print.print_size_id
  if (!isScpPrintSizeId(printSizeRaw)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown print_size_id "${printSizeRaw}". Expected one of: up_to_a6, up_to_a4, up_to_a3, oversize.`
    )
  }
  const printSizeId: ScpPrintSizeId = printSizeRaw

  const query = req.scope.resolve(
    ContainerRegistrationKeys.QUERY
  ) as RemoteJoinerGraphLike

  // Fetch the cart + every requested line in one round-trip. We need each
  // line's existing metadata so we can merge the new customizerDesign in
  // without losing other top-level keys (e.g. source_design_id, designId,
  // vectorization_for_order markers).
  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "completed_at",
      "currency_code",
      "region_id",
      "sales_channel_id",
      "region.id",
      "region.currency_code",
      "items.id",
      "items.quantity",
      "items.variant_id",
      "items.metadata",
    ],
  })

  const cart = carts?.[0] as
    | {
        id?: string
        completed_at?: unknown
        currency_code?: string | null
        region_id?: string | null
        sales_channel_id?: string | null
        region?: { currency_code?: string | null } | null
        items?: Array<{
          id?: string
          quantity?: number
          variant_id?: string | null
          metadata?: Record<string, unknown> | null
        }>
      }
    | undefined

  if (!cart || typeof cart !== "object") {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Cart "${cartId}" was not found.`
    )
  }
  if (cart.completed_at) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cannot modify a completed cart."
    )
  }

  const cartItems = Array.isArray(cart.items) ? cart.items : []
  const cartItemsById = new Map<
    string,
    {
      id: string
      quantity: number
      variant_id: string | null
      metadata: Record<string, unknown>
    }
  >()
  for (const it of cartItems) {
    if (!it?.id) continue
    cartItemsById.set(it.id, {
      id: it.id,
      quantity: typeof it.quantity === "number" ? it.quantity : 0,
      variant_id: typeof it.variant_id === "string" ? it.variant_id : null,
      metadata:
        it.metadata && typeof it.metadata === "object" ? it.metadata : {},
    })
  }

  // Targeted line ids must all exist on this cart. A stale page that lost
  // a sibling between page load and save would otherwise quietly drop the
  // edit — better to fail loudly so the customer can refetch the cart.
  const missing = lineIds.filter((id) => !cartItemsById.has(id))
  if (missing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Lines not found on cart: ${missing.slice(0, 5).join(", ")}${
        missing.length > 5 ? `, +${missing.length - 5} more` : ""
      }. Refresh the cart and try again.`
    )
  }

  // Pull the decoration plan once from the new design metadata. These
  // are identical across every targeted line because the design is
  // shared — variants only differ in colour/size.
  const designMetadataAsLine: Record<string, unknown> = {
    customizerDesign: newCustomizerDesign,
  }
  const decoratedSides = decoratedSidesFromLineMetadata(designMetadataAsLine)
  if (decoratedSides.length < 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "SCP design update requires at least one decorated print location."
    )
  }
  const decoratedLocations =
    decoratedLocationsFromLineMetadata(designMetadataAsLine)

  const sideDecorationMethods =
    typeof (newCustomizerDesign as Record<string, unknown>)
      .sideDecorationMethods === "object" &&
    (newCustomizerDesign as Record<string, unknown>).sideDecorationMethods !==
      null
      ? ((newCustomizerDesign as Record<string, unknown>)
          .sideDecorationMethods as Record<string, string>)
      : {}
  const sideEmbroideryConfigs =
    typeof (newCustomizerDesign as Record<string, unknown>)
      .sideEmbroideryConfigs === "object" &&
    (newCustomizerDesign as Record<string, unknown>).sideEmbroideryConfigs !==
      null
      ? ((newCustomizerDesign as Record<string, unknown>)
          .sideEmbroideryConfigs as Record<
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

  const round2 = (n: number) => Math.round(n * 100) / 100

  const updatedLineIds: string[] = []
  const skippedLineIds: string[] = []

  // Per-line update: recompute unit_price from the line's own quantity +
  // the new design, then write metadata + unit_price via the core workflow.
  // Each call hits a distinct line, so they're safe to fan out — but we
  // keep them sequential for simpler error reporting; recompute below
  // re-prices everything in a single parallel pass anyway.
  for (const lineId of lineIds) {
    const line = cartItemsById.get(lineId)
    if (!line || !line.variant_id || line.quantity <= 0) {
      skippedLineIds.push(lineId)
      continue
    }

    const tierIndex = resolveScpTierIndexForQuantity(line.quantity)

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
    const embroideryBreakdown: Array<{
      side: string
      stitchCount: number
      unitDecorationMajor: number
      digitizingFeeMajor: number
      unitPriceMajor: number
      requiresQuote: boolean
    }> = []
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
        quantity: line.quantity,
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
      variantId: line.variant_id,
      quantity: line.quantity,
      cart: cart as {
        id?: string
        currency_code?: string | null
        region_id?: string | null
        sales_channel_id?: string | null
        region?: { currency_code?: string | null } | null
      },
    })

    const unitPriceMajor = round2(
      Math.max(0, garmentMajor) +
        Math.max(0, printTotalMajor) +
        Math.max(0, embroideryTotalMajor)
    )

    const newPricingExisting =
      typeof (newCustomizerDesign as Record<string, unknown>).pricing ===
        "object" &&
      (newCustomizerDesign as Record<string, unknown>).pricing !== null
        ? ((newCustomizerDesign as Record<string, unknown>).pricing as Record<
            string,
            unknown
          >)
        : {}

    const mergedCustomizerDesign: Record<string, unknown> = {
      ...newCustomizerDesign,
      pricing: {
        ...newPricingExisting,
        server: {
          mode: embroiderySides.length > 0 ? "scp_dtf_mixed" : "scp_dtf",
          version: SCP_PRINT_PRICING_VERSION,
          embroidery_version:
            embroiderySides.length > 0
              ? EMBROIDERY_PRICING_VERSION
              : undefined,
          print_size_id: printSizeId,
          tier_index: tierIndex,
          quantity_tier_label:
            SCP_BLANK_ALIGNED_QUANTITY_TIERS[tierIndex]?.label ?? null,
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

    // Preserve every other top-level key on the existing line metadata
    // (e.g. source_design_id, designId, vectorization_for_order). Only
    // customizerDesign + the optional product_handle/title carry-overs
    // are rewritten by this route.
    const mergedMetadata: Record<string, unknown> = {
      ...line.metadata,
      customizerDesign: mergedCustomizerDesign,
      ...(product_handle ? { product_handle } : {}),
      ...(product_title ? { product_title } : {}),
    }

    await updateLineItemInCartWorkflow(req.scope as never).run({
      input: {
        cart_id: cartId,
        item_id: lineId,
        update: {
          unit_price: unitPriceMajor,
          metadata: mergedMetadata,
        },
      },
    })

    updatedLineIds.push(lineId)
  }

  // Cross-cart aggregation runs once after all per-line updates landed.
  // It re-reads the cart, picks up the new server-pricing blocks, and
  // re-tiers prices against the aggregated quantity. Idempotent — a noop
  // if no other lines need re-pricing.
  let aggregationSummary: {
    aggregated_quantity: number
    updates: number
  } | null = null
  try {
    const result = await recomputeScpCartPricing(cartId, req.scope)
    aggregationSummary = {
      aggregated_quantity: result.aggregated_quantity,
      updates: result.updates.length,
    }
  } catch (aggError) {
    // Aggregation is non-fatal — the per-line updates have already landed.
    // eslint-disable-next-line no-console
    console.error(
      "recomputeScpCartPricing failed after scp-update-design (non-fatal)",
      aggError
    )
  }

  const distinctId =
    (req as unknown as { auth_context?: { actor_id?: string } }).auth_context
      ?.actor_id ?? `cart_${cartId}`
  getPostHog()?.capture({
    distinctId,
    event: "scp design updated in place",
    properties: {
      cart_id: cartId,
      updated_line_ids: updatedLineIds,
      skipped_line_ids: skippedLineIds,
      print_size_id: printSizeId,
      decorated_sides: decoratedSides.length,
    },
  })

  return res.status(200).json({
    ok: true,
    cart_id: cartId,
    updated_line_ids: updatedLineIds,
    skipped_line_ids: skippedLineIds,
    aggregation: aggregationSummary,
  })
}
