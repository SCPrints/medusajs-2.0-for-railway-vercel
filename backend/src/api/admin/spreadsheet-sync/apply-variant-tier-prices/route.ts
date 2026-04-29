import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import type { TierMoneyMinor } from "../../../../utils/bulk-tier-prices"
import {
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../../../../utils/bulk-tier-prices"

const tiersSchema = z.object({
  base: z.number().int().positive(),
  t10: z.number().int().positive(),
  t50: z.number().int().positive(),
  t100: z.number().int().positive(),
})

const bodySchema = z.object({
  items: z.array(
    z.object({
      variant_id: z.string().min(1),
      tiers_minor: tiersSchema,
    })
  ),
})

type ProductModuleLike = {
  updateProductVariants: (id: string, data: Record<string, unknown>) => Promise<unknown>
}

/**
 * POST /admin/spreadsheet-sync/apply-variant-tier-prices
 *
 * Applies AUD quantity-band prices via Pricing Module (aligned with `import-dnc-products.ts`).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid body: ${parsed.error.flatten().formErrors.join("; ") || parsed.error.message}`
    )
  }

  const pricingModuleService = req.scope.resolve(Modules.PRICING) as {
    upsertPriceSets: (data: Array<Record<string, unknown>>) => Promise<Array<{ id?: string }>>
  }
  const productModuleService = req.scope.resolve(Modules.PRODUCT) as ProductModuleLike
  const link = req.scope.resolve(ContainerRegistrationKeys.LINK) as {
    create: (data: Record<string, unknown>) => Promise<unknown>
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (a: Record<string, unknown>) => Promise<{ data?: unknown[] }>
  }

  const results: Array<{ variant_id: string; ok: boolean; message?: string }> = []

  for (const item of parsed.data.items) {
    const tiers = item.tiers_minor as TierMoneyMinor

    try {
      const { data } = await query.graph({
        entity: "product_variant",
        fields: ["id", "sku", "price_set.id", "metadata"],
        filters: { id: [item.variant_id] },
      })
      const vrow = data?.[0] as
        | {
            id: string
            sku?: string
            price_set?: { id?: string }
            metadata?: Record<string, unknown>
          }
        | undefined

      if (!vrow?.id) {
        results.push({
          variant_id: item.variant_id,
          ok: false,
          message: "Variant not found",
        })
        continue
      }

      const pricesForPriceSet = tierMinorToPriceSetRows(tiers)
      const bulkMeta = tierMinorToBulkPricingMetadata(tiers)

      const priceSetId = vrow.price_set?.id
      if (priceSetId) {
        await pricingModuleService.upsertPriceSets([{ id: priceSetId, prices: pricesForPriceSet }])
      } else {
        const createdPriceSets = await pricingModuleService.upsertPriceSets([
          { prices: pricesForPriceSet },
        ])
        const newId = createdPriceSets[0]?.id
        if (!newId) {
          results.push({
            variant_id: item.variant_id,
            ok: false,
            message: "Failed to create price set",
          })
          continue
        }
        await link.create({
          [Modules.PRODUCT]: { variant_id: vrow.id },
          [Modules.PRICING]: { price_set_id: newId },
        })
      }

      const existingMeta = (vrow.metadata ?? {}) as Record<string, unknown>
      await productModuleService.updateProductVariants(vrow.id, {
        metadata: {
          ...existingMeta,
          bulk_pricing: bulkMeta,
        },
      })

      results.push({ variant_id: item.variant_id, ok: true })
    } catch (e) {
      results.push({
        variant_id: item.variant_id,
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      })
    }
  }

  return res.status(200).json({ results })
}
