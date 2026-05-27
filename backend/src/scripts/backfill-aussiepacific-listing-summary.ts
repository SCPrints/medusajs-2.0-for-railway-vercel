import {
  ContainerRegistrationKeys,
  Modules,
  QueryContext,
} from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"

import { computeListingSummary } from "../lib/listing-summary"

/**
 * Populate `product.metadata.listing_summary` on every Aussie Pacific product.
 *
 * Why: the storefront's brand-listing card has a fast-path that reads this
 * pre-computed blob instead of iterating the full variant tree. Once every AP
 * product has the summary, the brand-products backend route can also skip
 * variant expansion entirely (it does — see route.ts:185) and the per-page
 * payload + SSR cost drops dramatically.
 *
 * Re-run after:
 *   - A full AP import (creates new products without the summary)
 *   - A pricing change in admin (calculated_price moves but bulk_pricing.tiers
 *     stay the same; summary refresh picks up the new amount)
 *   - This script is added in 2026-05 — back-populates existing rows
 *
 * Usage:
 *   cd backend && npx medusa exec src/scripts/backfill-aussiepacific-listing-summary.ts
 *
 * Env flags:
 *   DRY_RUN=1            preview without writing
 *   ONLY_MISSING=1       skip products that already have a listing_summary
 *   LIMIT=<n>            cap how many products to process (handy for testing)
 *
 * Safe to re-run — the update is idempotent and pure metadata.
 */
export default async function backfillAussiePacificListingSummary({
  container,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productService = container.resolve(Modules.PRODUCT)
  const regionService = container.resolve(Modules.REGION)

  const dryRun = process.env.DRY_RUN === "1"
  const onlyMissing = process.env.ONLY_MISSING === "1"
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined

  logger.info(
    `Backfilling AP listing_summary [dryRun=${dryRun}, onlyMissing=${onlyMissing}, limit=${
      limit ?? "all"
    }]`
  )

  // Pick the AU region for pricing context. AP is AU-only at the moment; if
  // we ever serve multiple regions, summaries become per-region (different
  // calculated_price per region) — for now one region's calc is the truth.
  const regions = await regionService.listRegions(
    { currency_code: "aud" },
    { take: 1 }
  )
  const region = regions[0]
  if (!region) {
    logger.error("No AUD region found — cannot resolve calculated_price.")
    return
  }
  logger.info(`Using region ${region.id} (${region.currency_code}) for pricing context.`)

  // Page through every product whose `metadata.source = "aussiepacific"`.
  const PAGE = 100
  let offset = 0
  let processed = 0
  let updated = 0
  let skipped = 0
  let failed = 0
  let exhausted = false

  while (!exhausted) {
    if (typeof limit === "number" && processed >= limit) {
      logger.info(`Hit LIMIT=${limit}, stopping.`)
      break
    }

    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "metadata",
        "options.id",
        "options.title",
        "variants.id",
        "variants.options.option_id",
        "variants.options.value",
        "variants.calculated_price.calculated_amount",
        "variants.calculated_price.currency_code",
        "variants.metadata",
      ],
      filters: { metadata: { source: "aussiepacific" } } as any,
      pagination: { take: PAGE, skip: offset },
      context: {
        variants: {
          calculated_price: QueryContext({
            region_id: region.id,
            currency_code: region.currency_code,
          }),
        },
      } as any,
    })

    if (!products || products.length === 0) {
      exhausted = true
      break
    }

    const updates: Array<{ id: string; metadata: Record<string, unknown> }> = []

    for (const p of products) {
      processed++
      if (typeof limit === "number" && processed > limit) break

      const existingMeta = (p?.metadata ?? {}) as Record<string, unknown>
      if (onlyMissing && existingMeta.listing_summary) {
        skipped++
        continue
      }

      const summary = computeListingSummary({
        options: p.options as any,
        variants: p.variants as any,
      })
      if (!summary) {
        logger.warn(
          `  ${p.handle ?? p.id}: computeListingSummary returned null — leaving as-is`
        )
        failed++
        continue
      }

      updates.push({
        id: p.id as string,
        metadata: { ...existingMeta, listing_summary: summary },
      })
    }

    if (updates.length === 0) {
      offset += products.length
      continue
    }

    if (!dryRun) {
      // Medusa's productModule.updateProducts(id, data) signature is per-row.
      // Bulk-update is "same data → many ids by selector", which doesn't fit
      // our per-product metadata. Sequential per-row keeps it simple and the
      // total is small enough (~80 AP products) that it finishes in seconds.
      for (const u of updates) {
        try {
          await (productService as any).updateProducts(u.id, {
            metadata: u.metadata,
          })
          updated++
        } catch (err) {
          logger.error(
            `  ${u.id}: update failed — ${
              err instanceof Error ? err.message : String(err)
            }`
          )
          failed++
        }
      }
    } else {
      logger.info(`  [dry run] would update ${updates.length} products`)
      const sample = updates[0]
      if (sample) {
        const s = (sample.metadata as any).listing_summary
        logger.info(
          `  sample: ${sample.id} → colors=${s.colors.length}, cheapest=${s.cheapest_amount} ${s.currency_code}, 100+=${s.hundred_plus_amount}`
        )
      }
      updated += updates.length
    }

    offset += products.length
    if (products.length < PAGE) exhausted = true
  }

  logger.info(
    `Done. processed=${processed} updated=${updated} skipped=${skipped} failed=${failed} dryRun=${dryRun}`
  )
}
