/**
 * Repair inverted retail ladders on spreadsheet-sync'd catalogs (DNC, Ramo).
 *
 * The spreadsheet sync treated the sheet's "Variant Price AUD" column as the
 * RETAIL 100+ tier ("20% off list") and derived the other tiers upward from
 * it. But the DNC/Ramo sheets held the supplier TRADE price (ex-GST cost), so
 * the whole ladder came out at ~57% of standard retail and the 100+ tier sat
 * BELOW cash cost (dnc-4202: sold $14.00 at 100+ vs $15.40 cash cost).
 *
 * Repair: for every variant whose `bulk_pricing.source === "spreadsheet-sync"`,
 * read cost = the current 100+ tier amount (== the original sheet value ==
 * trade ex-GST cost), rebuild the ladder with the standard buildPriceLadder()
 * markup, stamp `cost_price_ex_gst_minor` (unlocks B2B tier price lists), and
 * rewrite the variant's AUD base price to the new 1-9 amount (inc-GST, like
 * every other retail amount post-HOLD cutover).
 *
 * Idempotent: repaired variants get `bulk_pricing.source = "ladder-repair"`
 * and are skipped on re-run.
 *
 * Usage (prod):
 *   cd /app/.medusa/server
 *   DRY_RUN=1 npx medusa exec src/scripts/repair-spreadsheet-sync-ladders.js
 *   npx medusa exec src/scripts/repair-spreadsheet-sync-ladders.js
 *
 * Env:
 *   DRY_RUN=1        preview only, no writes
 *   BRANDS=dnc       comma-separated handle prefixes (default "dnc" —
 *                    verify Ramo against a real Ramo trade price list before
 *                    adding "ramo")
 *   LIMIT=10         cap number of PRODUCTS touched (spot-check runs)
 *
 * After a real run: purge the storefront cache (POST {storefront}/api/
 * revalidate-products with the REVALIDATE_SECRET) and reindex Meilisearch
 * (min_price_aud is indexed) — updateProductsWorkflow emits product.updated
 * so the plugin should follow, but a bulk sweep is cheap insurance.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

import { buildPriceLadder, buildBulkPricingMetadata } from "../utils/bulk-price-ladder"

const PAGE_SIZE = 50
const CHUNK = 20

type VariantRow = {
  id: string
  sku?: string | null
  metadata?: Record<string, unknown> | null
}

type ProductRow = {
  id: string
  handle: string
  variants?: VariantRow[]
}

export default async function repairSpreadsheetSyncLadders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const dryRun = process.env.DRY_RUN === "1"
  const brands = (process.env.BRANDS ?? "dnc")
    .split(",")
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean)
  const limit = Number(process.env.LIMIT) > 0 ? Number(process.env.LIMIT) : Infinity

  logger.info(
    `repair-spreadsheet-sync-ladders: brands=[${brands.join(", ")}] dryRun=${dryRun} limit=${limit === Infinity ? "none" : limit}`
  )

  let skip = 0
  let productsTouched = 0
  let variantsRepaired = 0
  let variantsSkipped = 0
  const sampleLines: string[] = []
  const anomalies: string[] = []

  type PriceBand = {
    currency_code: string
    amount: number
    min_quantity: number
    max_quantity?: number
  }
  type ProductPayload = {
    id: string
    variants: Array<{
      id: string
      metadata: Record<string, unknown>
      prices: PriceBand[]
    }>
  }
  let pendingChunk: ProductPayload[] = []

  const flush = async () => {
    if (!pendingChunk.length || dryRun) {
      pendingChunk = []
      return
    }
    await updateProductsWorkflow(container).run({
      input: { products: pendingChunk as never },
    })
    pendingChunk = []
  }

  outer: for (;;) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "variants.id", "variants.sku", "variants.metadata"],
      pagination: { skip, take: PAGE_SIZE },
    })
    const products = (data ?? []) as ProductRow[]
    if (!products.length) break

    for (const product of products) {
      if (!brands.some((b) => product.handle?.startsWith(`${b}-`))) continue

      const variantPayloads: ProductPayload["variants"] = []
      for (const variant of product.variants ?? []) {
        const meta = (variant.metadata ?? {}) as Record<string, unknown>
        const bp = meta.bulk_pricing as
          | { source?: string; tiers?: Array<{ min_quantity?: number; amount?: number }> }
          | undefined
        if (!bp || bp.source !== "spreadsheet-sync") {
          variantsSkipped++
          continue
        }
        const cost = bp.tiers?.find((t) => t?.min_quantity === 100)?.amount
        if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) {
          anomalies.push(`${product.handle} ${variant.sku ?? variant.id}: no usable 100+ tier`)
          variantsSkipped++
          continue
        }

        const ladder = buildPriceLadder(cost)
        variantPayloads.push({
          id: variant.id,
          // Medusa update REPLACES metadata jsonb — always spread the full
          // existing metadata or every other key is wiped.
          metadata: {
            ...meta,
            cost_price_ex_gst_minor: Math.round(cost * 100),
            bulk_pricing: {
              ...buildBulkPricingMetadata(ladder),
              currency_code: "aud",
              source: "ladder-repair",
              ladder_note: `Rebuilt ${new Date().toISOString().slice(0, 10)} from trade cost ${cost.toFixed(2)} ex-GST (spreadsheet-sync had inverted the ladder: sheet held the trade price but was treated as the retail 100+ tier).`,
            },
          },
          // Spreadsheet-sync wrote 5 quantity-banded AUD price rows; the
          // upsert replaces the variant's price set, so mirror all 5 bands.
          prices: [
            { currency_code: "aud", amount: ladder.base, min_quantity: 1, max_quantity: 9 },
            { currency_code: "aud", amount: ladder.tier10to19, min_quantity: 10, max_quantity: 19 },
            { currency_code: "aud", amount: ladder.tier20to49, min_quantity: 20, max_quantity: 49 },
            { currency_code: "aud", amount: ladder.tier50to99, min_quantity: 50, max_quantity: 99 },
            { currency_code: "aud", amount: ladder.tier100Plus, min_quantity: 100 },
          ],
        })
        variantsRepaired++
        if (sampleLines.length < 10) {
          sampleLines.push(
            `${product.handle} ${variant.sku ?? variant.id}: cost ${cost.toFixed(2)} → 1-9 $${ladder.base} / 100+ $${ladder.tier100Plus}`
          )
        }
      }

      if (variantPayloads.length) {
        productsTouched++
        pendingChunk.push({ id: product.id, variants: variantPayloads })
        if (pendingChunk.length >= CHUNK) {
          await flush()
          logger.info(
            `progress: ${productsTouched} products / ${variantsRepaired} variants${dryRun ? " (dry run)" : ""}`
          )
        }
        if (productsTouched >= limit) break outer
      }
    }
    skip += PAGE_SIZE
  }
  await flush()

  logger.info(`--- repair-spreadsheet-sync-ladders ${dryRun ? "DRY RUN " : ""}summary ---`)
  logger.info(`products touched:  ${productsTouched}`)
  logger.info(`variants repaired: ${variantsRepaired}`)
  logger.info(`variants skipped:  ${variantsSkipped} (non-matching source or no ladder)`)
  for (const line of sampleLines) logger.info(`sample: ${line}`)
  if (anomalies.length) {
    logger.warn(`anomalies (${anomalies.length}):`)
    for (const line of anomalies.slice(0, 20)) logger.warn(`  ${line}`)
  }
  if (dryRun) logger.info("DRY_RUN=1 — nothing written. Re-run without DRY_RUN to apply.")
}
