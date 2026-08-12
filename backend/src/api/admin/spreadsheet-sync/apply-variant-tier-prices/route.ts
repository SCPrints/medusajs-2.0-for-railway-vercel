import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import type { TierMoneyMinor } from "../../../../utils/bulk-tier-prices"
import {
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../../../../utils/bulk-tier-prices"
import {
  costExGstMinorFromMetadata,
  findBelowCostViolations,
  type TierPricingViolation,
} from "../../../../lib/safe-tier-pricing"

const tiersSchema = z.object({
  t1_9: z.number().int().positive(),
  t10_19: z.number().int().positive(),
  t20_49: z.number().int().positive(),
  t50_99: z.number().int().positive(),
  t100_plus: z.number().int().positive(),
})

const bodySchema = z.object({
  items: z.array(
    z.object({
      variant_id: z.string().min(1),
      tiers_minor: tiersSchema,
    })
  ),
  /**
   * Below-cost override. The guard blocks the WHOLE batch when any proposed
   * 100+ tier sits below a variant's stamped cash cost (cost × 1.1) — the
   * signature of a sheet whose price column holds supplier COST instead of
   * retail (the 2026-08-12 DNC inversion). Only set true after a human has
   * looked at the violations and confirmed the prices are intentional.
   */
  force_below_cost: z.boolean().optional(),
})

type ProductModuleLike = {
  updateProductVariants: (id: string, data: Record<string, unknown>) => Promise<unknown>
}

type VariantRow = {
  id: string
  sku?: string
  price_set?: { id?: string }
  metadata?: Record<string, unknown>
}

/**
 * POST /admin/spreadsheet-sync/apply-variant-tier-prices
 *
 * Applies AUD quantity-band prices via Pricing Module (aligned with `import-dnc-products.ts`).
 * Guarded: refuses the whole batch when any ladder prices below a variant's
 * stamped cost (see `lib/safe-tier-pricing.ts`) unless `force_below_cost`.
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

  // Batch-fetch every targeted variant up front — the guard needs the whole
  // batch's cost picture before anything is written.
  const variantIds = parsed.data.items.map((i) => i.variant_id)
  const variantById = new Map<string, VariantRow>()
  if (variantIds.length) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku", "price_set.id", "metadata"],
      filters: { id: variantIds },
    })
    for (const row of (data ?? []) as VariantRow[]) {
      if (row?.id) variantById.set(row.id, row)
    }
  }

  const violations: TierPricingViolation[] = findBelowCostViolations(
    parsed.data.items.map((item) => {
      const vrow = variantById.get(item.variant_id)
      return {
        variant_id: item.variant_id,
        sku: vrow?.sku ?? null,
        t100_plus_minor: item.tiers_minor.t100_plus,
        cost_ex_gst_minor: costExGstMinorFromMetadata(vrow?.metadata),
      }
    })
  )

  if (violations.length && !parsed.data.force_below_cost) {
    // All-or-nothing: nothing was written. A partial apply on a cost-as-retail
    // sheet would leave the catalog half-inverted.
    return res.status(200).json({
      blocked: true,
      results: [],
      violations,
      message:
        `${violations.length} of ${parsed.data.items.length} proposed ladder(s) price the 100+ tier below the variant's cash cost (cost × 1.1). ` +
        `The price column probably contains the SUPPLIER COST, not your retail price — nothing was applied. ` +
        `If these prices are genuinely intentional, re-run with force_below_cost.`,
    })
  }

  const results: Array<{ variant_id: string; ok: boolean; message?: string }> = []

  for (const item of parsed.data.items) {
    const tiers = item.tiers_minor as TierMoneyMinor

    try {
      const vrow = variantById.get(item.variant_id)
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

  return res.status(200).json({
    results,
    // Forced batches echo the violations so the operator's log records what
    // was knowingly overridden.
    ...(violations.length ? { violations, forced: true } : {}),
  })
}
