import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
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
  RemoteJoinerGraphLike,
  resolveGarmentUnitAmountMajor,
} from "../../../../../lib/scp-resolve-garment-unit-price"

const cartParamsSchema = z.object({
  id: z.string().min(1),
})

const scpPrintSchema = z.object({
  version: z.number().int().optional(),
  print_size_id: z
    .string()
    .min(1)
    .transform((v) => v.trim()),
})

const bodySchema = z.object({
  variant_id: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999),
  metadata: z.record(z.string(), z.unknown()).optional(),
  scp_print: scpPrintSchema,
})

/**
 * POST /store/carts/:id/scp-line-items
 *
 * Adds one SCP-priced customizable line using server-computed `unit_price` (garment + tiered print),
 * aligned with blank bulk quantity tiers.
 *
 * QA checklist:
 * - Spot-check cart subtotal / checkout total vs payment intent (Stripe) for qty bands (9→10, 19→20, etc.).
 * - PDP: set product metadata `use_scp_dtf_cart_pricing: true` before expecting SCP pricing on overlay adds.
 * - Note: changing cart line quantity via core update-line-item does not yet recompute SCP `unit_price`.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
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
      `Invalid payload: ${parsedBody.error.issues.map((i) => i.message).join(", ")}`
    )
  }

  const cartId = parsedParams.data.id
  const { variant_id: variantId, quantity, metadata: incomingMetadata, scp_print } = parsedBody.data

  const printSizeRaw = scp_print.print_size_id
  if (!isScpPrintSizeId(printSizeRaw)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown print_size_id "${printSizeRaw}". Expected one of: up_to_a6, up_to_a4, up_to_a3, oversize.`
    )
  }
  const printSizeId: ScpPrintSizeId = printSizeRaw

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as RemoteJoinerGraphLike

  const { data: carts } = await query.graph({
    entity: "cart",
    filters: { id: cartId },
    fields: [
      "id",
      "currency_code",
      "region_id",
      "sales_channel_id",
      "completed_at",
      "region.id",
      "region.currency_code",
    ],
  })

  const cart = carts?.[0] as Record<string, unknown> | undefined
  if (!cart || typeof cart !== "object") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart "${cartId}" was not found.`)
  }

  if (cart.completed_at) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cannot modify a completed cart.")
  }

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
  const printTotalMajor =
    decoratedLocations.length > 0
      ? scpPrintTotalMajorFromLocations({
          selectedPrintSizeId: printSizeId,
          tierIndex,
          locations: decoratedLocations,
        })
      : scpPrintTotalMajorPerGarmentForSides({
          selectedPrintSizeId: printSizeId,
          tierIndex,
          decoratedSides,
        })

  const garmentMajor = await resolveGarmentUnitAmountMajor({
    query,
    variantId,
    quantity,
    cart: cart as {
      id?: string
      currency_code?: string | null
      region_id?: string | null
      sales_channel_id?: string | null
      region?: { currency_code?: string | null } | null
    },
  })

  const round2 = (n: number) => Math.round(n * 100) / 100
  const unitPriceMajor = round2(Math.max(0, garmentMajor) + Math.max(0, printTotalMajor))

  const customizerDesignRaw = mergedMetadata.customizerDesign
  const customizerDesign =
    typeof customizerDesignRaw === "object" && customizerDesignRaw !== null
      ? (customizerDesignRaw as Record<string, unknown>)
      : {}

  const pricingRaw = customizerDesign.pricing
  const pricingExisting =
    typeof pricingRaw === "object" && pricingRaw !== null ? (pricingRaw as Record<string, unknown>) : {}

  const mergedCustomizerDesign: Record<string, unknown> = {
    ...customizerDesign,
    pricing: {
      ...pricingExisting,
      server: {
        mode: "scp_dtf",
        version: SCP_PRINT_PRICING_VERSION,
        print_size_id: printSizeId,
        tier_index: tierIndex,
        quantity_tier_label: SCP_BLANK_ALIGNED_QUANTITY_TIERS[tierIndex]?.label ?? null,
        decorated_sides: decoratedSides.length,
        decorated_side_keys: decoratedSides,
        decorated_locations: decoratedLocations,
        garment_unit_major: garmentMajor,
        print_total_major_per_garment: printTotalMajor,
        unit_price_major: unitPriceMajor,
      },
    },
  }

  mergedMetadata.customizerDesign = mergedCustomizerDesign

  await addToCartWorkflow(req.scope).run({
    input: {
      cart_id: cartId,
      items: [
        {
          variant_id: variantId,
          quantity,
          unit_price: unitPriceMajor,
          metadata: mergedMetadata,
        },
      ],
    },
  })

  return res.status(200).json({
    ok: true,
    cart_id: cartId,
    unit_price: unitPriceMajor,
  })
}
