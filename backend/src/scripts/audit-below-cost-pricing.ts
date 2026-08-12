/**
 * Below-cost pricing audit — stamps `product.metadata.pricing_audit` so the
 * "Below cost" data-quality flag in /app/product-data can surface catalog
 * state that slipped past the apply-variant-tier-prices guard (manual price
 * edits, importer bugs, future flows). Same shape as the image audit:
 * periodic scan writes a metadata stamp; the list route reads it.
 *
 * A product is flagged when ANY variant's `bulk_pricing` 100+ tier amount is
 * below that variant's cash cost (`cost_price_ex_gst_minor` × 1.1). Variants
 * without stamped cost are skipped — unauditable, not wrong.
 *
 * Only writes products whose flagged-ness CHANGED (no reindex storm over a
 * healthy catalog). Runs from the daily `regenerate-tier-prices` job (cost
 * data is freshest right after the regen) or on demand:
 *
 *   DRY_RUN=1 npx medusa exec src/scripts/audit-below-cost-pricing.js
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { costExGstMinorFromMetadata, isBelowCost } from "../lib/safe-tier-pricing"

const PAGE_SIZE = 100

type VariantRow = { id: string; sku?: string | null; metadata?: Record<string, unknown> | null }
type ProductRow = {
  id: string
  handle?: string
  metadata?: Record<string, unknown> | null
  variants?: VariantRow[]
}

const tier100MajorFromBulkPricing = (
  metadata: Record<string, unknown> | null | undefined
): number | null => {
  const bp = metadata?.bulk_pricing as
    | { tiers?: Array<{ min_quantity?: number; amount?: number }> }
    | undefined
  const amount = bp?.tiers?.find((t) => t?.min_quantity === 100)?.amount
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null
}

export default async function auditBelowCostPricing({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as {
    updateProducts: (id: string, data: Record<string, unknown>) => Promise<unknown>
  }
  const dryRun = process.env.DRY_RUN === "1"

  let skip = 0
  let scanned = 0
  let flagged = 0
  let cleared = 0
  const sample: string[] = []

  for (;;) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "metadata", "variants.id", "variants.sku", "variants.metadata"],
      pagination: { skip, take: PAGE_SIZE },
    })
    const products = (data ?? []) as ProductRow[]
    if (!products.length) break

    for (const product of products) {
      scanned++
      const offenders: Array<{ sku: string | null; t100_minor: number; cash_cost_minor: number }> =
        []
      for (const variant of product.variants ?? []) {
        const cost = costExGstMinorFromMetadata(variant.metadata)
        if (cost === null) continue
        const t100Major = tier100MajorFromBulkPricing(variant.metadata)
        if (t100Major === null) continue
        const t100Minor = Math.round(t100Major * 100)
        if (isBelowCost(t100Minor, cost)) {
          offenders.push({
            sku: variant.sku ?? null,
            t100_minor: t100Minor,
            cash_cost_minor: Math.round(cost * 1.1),
          })
        }
      }

      const wasFlagged =
        (product.metadata?.pricing_audit as { status?: string } | undefined)?.status ===
        "below_cost"
      const isFlagged = offenders.length > 0
      if (isFlagged === wasFlagged) continue

      if (isFlagged) {
        flagged++
        if (sample.length < 10) {
          sample.push(
            `${product.handle}: ${offenders.length} variant(s), e.g. ${offenders[0].sku} t100 ${(offenders[0].t100_minor / 100).toFixed(2)} < cash cost ${(offenders[0].cash_cost_minor / 100).toFixed(2)}`
          )
        }
      } else {
        cleared++
      }

      if (!dryRun) {
        await productModule.updateProducts(product.id, {
          // Read-modify-write: Medusa update REPLACES metadata jsonb.
          metadata: {
            ...(product.metadata ?? {}),
            pricing_audit: isFlagged
              ? {
                  status: "below_cost",
                  below_cost_variant_count: offenders.length,
                  sample: offenders.slice(0, 5),
                  checked_at: new Date().toISOString(),
                }
              : { status: "ok", checked_at: new Date().toISOString() },
          },
        })
      }
    }
    skip += PAGE_SIZE
  }

  logger.info(
    `[audit-below-cost-pricing] ${dryRun ? "DRY RUN " : ""}scanned ${scanned} products — newly flagged: ${flagged}, cleared: ${cleared}`
  )
  for (const line of sample) logger.info(`[audit-below-cost-pricing] ${line}`)
}
