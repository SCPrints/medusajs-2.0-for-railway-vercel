import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createWorkflow, createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"

import {
  decoratedLocationsFromLineMetadata,
  resolveScpTierIndexForQuantity,
  scpPrintTotalMajorFromLocations,
  isScpPrintSizeId,
  type ScpPrintSizeId,
} from "../lib/scp-dtf-print-pricing"
import {
  garmentMajorFromBulkMetadataOrNull,
  type RemoteJoinerGraphLike,
} from "../lib/scp-resolve-garment-unit-price"
import {
  isWholesaleGroup,
  resolveWholesalePrintTierIndex,
  wholesalePrintUnitMajorForTier,
} from "../lib/wholesale-dtf-print-pricing"

const round2 = (n: number) => Math.round(n * 100) / 100

type RepriceInput = { cart_id: string }

type LineReprice = {
  lineId: string
  currentUnitPrice: number
  newUnitPrice: number
  variantId: string
}

const computeRepricingStep = createStep(
  "compute-repricing",
  async (input: RepriceInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as RemoteJoinerGraphLike

    const { data: carts } = await query.graph({
      entity: "cart",
      filters: { id: input.cart_id },
      fields: [
        "id",
        "customer_id",
        "currency_code",
        "region_id",
        "sales_channel_id",
        "region.id",
        "region.currency_code",
        "items.id",
        "items.variant_id",
        "items.quantity",
        "items.unit_price",
        "items.metadata",
      ],
    })

    const cart = carts?.[0] as Record<string, unknown> | undefined
    if (!cart) {
      return new StepResponse({ changes: [] as LineReprice[], totalQty: 0, track: "retail" as const })
    }

    const items = ((cart.items ?? []) as Array<Record<string, unknown>>)

    // Only garment lines (created by customizer) participate in the qty pool.
    const garmentLines = items.filter((item) => {
      const cd = (item.metadata as Record<string, unknown> | null | undefined)?.customizerDesign
      return typeof cd === "object" && cd !== null && (cd as Record<string, unknown>).type === "fabric_customizer"
    })

    if (!garmentLines.length) {
      return new StepResponse({ changes: [] as LineReprice[], totalQty: 0, track: "retail" as const })
    }

    const totalQty = garmentLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)

    // Determine pricing track from customer group.
    let wholesaleGroupName: string | null = null
    const customerId = cart.customer_id as string | null | undefined
    if (customerId) {
      const { data: customers } = await query.graph({
        entity: "customer",
        filters: { id: customerId },
        fields: ["id", "groups.id", "groups.name"],
      })
      const groups = (customers?.[0] as { groups?: Array<{ name?: string }> } | undefined)?.groups ?? []
      const wholesaleGroup = groups.find((g) => isWholesaleGroup(g.name ?? ""))
      if (wholesaleGroup?.name) {
        wholesaleGroupName = wholesaleGroup.name
      }
    }

    const isWholesale = wholesaleGroupName !== null
    const track = isWholesale ? ("wholesale" as const) : ("retail" as const)

    // Determine tier indices.
    const retailTierIndex = resolveScpTierIndexForQuantity(totalQty)
    const wholesalePrintTierIndex = resolveWholesalePrintTierIndex(totalQty)

    const changes: LineReprice[] = []

    for (const line of garmentLines) {
      const metadata = line.metadata as Record<string, unknown> | null | undefined
      const variantId = line.variant_id as string

      // Resolve garment price.
      let garmentMajor = 0
      if (isWholesale) {
        // Wholesale garment price is from Medusa Price List (already on calculated_price)
        // — it was set correctly when the line was added. We don't touch it during reprice.
        // Extract the garment component from existing server pricing.
        const serverPricing = (
          (metadata?.customizerDesign as Record<string, unknown> | undefined)
            ?.pricing as Record<string, unknown> | undefined
        )?.server as Record<string, unknown> | undefined
        garmentMajor = Number(serverPricing?.garment_unit_major ?? 0)
      } else {
        // Retail: look up garment price from variant bulk_pricing.tiers at totalQty.
        const { data: varRows } = await query.graph({
          entity: "variants",
          filters: { id: variantId },
          fields: ["id", "metadata"],
        })
        const variantMeta = (varRows?.[0] as { metadata?: Record<string, unknown> } | undefined)?.metadata
        const bulk = garmentMajorFromBulkMetadataOrNull(variantMeta ?? null, totalQty)
        garmentMajor = bulk !== null ? bulk : Number(
          (
            (metadata?.customizerDesign as Record<string, unknown> | undefined)
              ?.pricing as Record<string, unknown> | undefined
          )?.server &&
          ((
            (metadata?.customizerDesign as Record<string, unknown> | undefined)
              ?.pricing as Record<string, unknown> | undefined
          )?.server as Record<string, unknown>)?.garment_unit_major
          ?? 0
        )
      }

      // Resolve print price.
      const decoratedLocations = decoratedLocationsFromLineMetadata(metadata ?? null)

      // Fall back to the recorded print_size_id if individual locations lack per-print sizes.
      const serverPricing = (
        (metadata?.customizerDesign as Record<string, unknown> | undefined)
          ?.pricing as Record<string, unknown> | undefined
      )?.server as Record<string, unknown> | undefined
      const recordedSizeRaw = serverPricing?.print_size_id
      const fallbackSizeId: ScpPrintSizeId = isScpPrintSizeId(recordedSizeRaw) ? recordedSizeRaw : "up_to_a6"

      let printMajor = 0
      if (decoratedLocations.length > 0) {
        if (isWholesale) {
          printMajor = round2(
            decoratedLocations.reduce((sum, loc) => {
              const sizeId = isScpPrintSizeId(loc.printSizeId) ? loc.printSizeId : fallbackSizeId
              return sum + wholesalePrintUnitMajorForTier(sizeId, wholesalePrintTierIndex)
            }, 0)
          )
        } else {
          printMajor = scpPrintTotalMajorFromLocations({
            selectedPrintSizeId: fallbackSizeId,
            tierIndex: retailTierIndex,
            locations: decoratedLocations,
          })
        }
      }

      const newUnitPrice = round2(Math.max(0, garmentMajor) + Math.max(0, printMajor))
      const currentRaw = line.unit_price
      // unit_price from query may be a BigNumber-like object.
      const currentUnitPrice =
        typeof currentRaw === "number"
          ? round2(currentRaw)
          : typeof (currentRaw as { value?: unknown })?.value === "string"
          ? round2(parseFloat((currentRaw as { value: string }).value))
          : typeof (currentRaw as { numeric?: unknown })?.numeric === "number"
          ? round2((currentRaw as { numeric: number }).numeric)
          : 0

      if (Math.abs(newUnitPrice - currentUnitPrice) >= 0.005) {
        changes.push({
          lineId: line.id as string,
          currentUnitPrice,
          newUnitPrice,
          variantId,
        })
      }
    }

    return new StepResponse({ changes, totalQty, track })
  }
)

export const repriceCartGarmentLinesWorkflow = createWorkflow(
  "reprice-cart-garment-lines",
  function (input: RepriceInput) {
    const { changes, totalQty, track } = computeRepricingStep(input)
    return { changes, totalQty, track }
  }
)

/**
 * Apply computed price changes. Called separately so the caller can skip if
 * there are no changes (avoids triggering additional cart.updated events).
 */
export async function applyCartGarmentReprice(
  container: Parameters<typeof updateLineItemInCartWorkflow>[0],
  cartId: string,
  changes: LineReprice[]
): Promise<void> {
  for (const change of changes) {
    await updateLineItemInCartWorkflow(container).run({
      input: {
        cart_id: cartId,
        item_id: change.lineId,
        update: { unit_price: change.newUnitPrice },
      },
    })
  }
}
