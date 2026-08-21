/**
 * Reprice the flat-priced Ramo variants from the supplier CSV.
 *
 * Background (2026-08-21): the 2,716 spreadsheet-sync'd Ramo variants had
 * their inverted ladders fixed by repair-spreadsheet-sync-ladders. But the
 * REST of the Ramo catalog — 8,490 published + 2,022 draft variants — was
 * created with a single flat AUD price, no bulk_pricing ladder, and no cost
 * metadata (e.g. AP401S_AZ_S: flat $11.30 against a $9.90 inc-GST cash cost —
 * a ~14% margin with no quantity bands). This script prices them properly:
 * cost comes from the raw Ramo export CSV (`product_id` column == variant
 * SKU, `price_ex_gst` == supplier trade cost), the ladder is the standard
 * buildPriceLadder() used across the catalog, and cost_price_ex_gst_minor is
 * stamped (unlocks the B2B tier price lists + below-cost audit).
 *
 * Only variants WITHOUT bulk_pricing metadata are touched — the repaired
 * ladder variants and any future proper imports are left alone. Idempotent:
 * repriced variants get bulk_pricing.source = "ramo-csv-reprice" and are
 * skipped on re-run.
 *
 * Usage (prod):
 *   put the cost file on the machine first (sku,price_ex_gst per line):
 *     fly ssh sftp shell --app sc-prints-backend   # put /tmp/ramo-costs.csv
 *   cd /app/.medusa/server
 *   RAMO_COSTS_CSV=/tmp/ramo-costs.csv DRY_RUN=1 npx medusa exec src/scripts/reprice-ramo-flat-variants.js
 *   RAMO_COSTS_CSV=/tmp/ramo-costs.csv npx medusa exec src/scripts/reprice-ramo-flat-variants.js
 *
 * Env:
 *   RAMO_COSTS_CSV   path to a 2-column csv "sku,price_ex_gst" (header row ok)
 *   DRY_RUN=1        preview only
 *   LIMIT=10         cap number of PRODUCTS touched
 *
 * After a real run: purge the storefront cache + reindex Meilisearch (same
 * runbook as repair-spreadsheet-sync-ladders).
 */
import fs from "node:fs"

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

function loadCosts(path: string): Map<string, number> {
  const costs = new Map<string, number>()
  const raw = fs.readFileSync(path, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const [sku, price] = line.split(",").map((s) => s?.trim())
    if (!sku || !price) continue
    const cost = Number.parseFloat(price)
    if (!Number.isFinite(cost) || cost <= 0) continue
    costs.set(sku, cost)
  }
  return costs
}

export default async function repriceRamoFlatVariants({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const dryRun = process.env.DRY_RUN === "1"
  const csvPath = process.env.RAMO_COSTS_CSV?.trim()
  const limit = Number(process.env.LIMIT) > 0 ? Number(process.env.LIMIT) : Infinity
  if (!csvPath || !fs.existsSync(csvPath)) {
    logger.error(`RAMO_COSTS_CSV missing or not found: "${csvPath ?? ""}"`)
    return
  }
  const costs = loadCosts(csvPath)
  logger.info(
    `reprice-ramo-flat-variants: costs=${costs.size} dryRun=${dryRun} limit=${limit === Infinity ? "none" : limit}`
  )
  if (!costs.size) {
    logger.error("cost file parsed to zero rows — expected 'sku,price_ex_gst' lines")
    return
  }

  let skip = 0
  let productsTouched = 0
  let variantsRepriced = 0
  let variantsAlreadyLaddered = 0
  const unmatchedSkus: string[] = []
  const sampleLines: string[] = []

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
      if (!product.handle?.startsWith("ramo-")) continue

      const variantPayloads: ProductPayload["variants"] = []
      for (const variant of product.variants ?? []) {
        const meta = (variant.metadata ?? {}) as Record<string, unknown>
        if (meta.bulk_pricing) {
          variantsAlreadyLaddered++
          continue
        }
        const sku = variant.sku?.trim()
        const cost = sku ? costs.get(sku) : undefined
        if (!sku || cost === undefined) {
          unmatchedSkus.push(`${product.handle} ${sku ?? variant.id}`)
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
            ramo_cost_price_ex_gst_minor: Math.round(cost * 100),
            bulk_pricing: {
              ...buildBulkPricingMetadata(ladder),
              currency_code: "aud",
              source: "ramo-csv-reprice",
              ladder_note: `Priced ${new Date().toISOString().slice(0, 10)} from Ramo export trade cost ${cost.toFixed(2)} ex-GST (variant was created with a single flat price and no ladder).`,
            },
          },
          // The upsert replaces the variant's price set — write the full
          // 5-band ladder (the flat single row is superseded).
          prices: [
            { currency_code: "aud", amount: ladder.base, min_quantity: 1, max_quantity: 9 },
            { currency_code: "aud", amount: ladder.tier10to19, min_quantity: 10, max_quantity: 19 },
            { currency_code: "aud", amount: ladder.tier20to49, min_quantity: 20, max_quantity: 49 },
            { currency_code: "aud", amount: ladder.tier50to99, min_quantity: 50, max_quantity: 99 },
            { currency_code: "aud", amount: ladder.tier100Plus, min_quantity: 100 },
          ],
        })
        variantsRepriced++
        if (sampleLines.length < 10) {
          sampleLines.push(
            `${product.handle} ${sku}: cost ${cost.toFixed(2)} → 1-9 $${ladder.base} / 100+ $${ladder.tier100Plus}`
          )
        }
      }

      if (variantPayloads.length) {
        productsTouched++
        pendingChunk.push({ id: product.id, variants: variantPayloads })
        if (pendingChunk.length >= CHUNK) {
          await flush()
          logger.info(
            `progress: ${productsTouched} products / ${variantsRepriced} variants${dryRun ? " (dry run)" : ""}`
          )
        }
        if (productsTouched >= limit) break outer
      }
    }
    skip += PAGE_SIZE
  }
  await flush()

  logger.info(`--- reprice-ramo-flat-variants ${dryRun ? "DRY RUN " : ""}summary ---`)
  logger.info(`products touched:    ${productsTouched}`)
  logger.info(`variants repriced:   ${variantsRepriced}`)
  logger.info(`already laddered:    ${variantsAlreadyLaddered} (skipped)`)
  logger.info(`skus not in CSV:     ${unmatchedSkus.length}`)
  for (const line of sampleLines) logger.info(`sample: ${line}`)
  for (const line of unmatchedSkus.slice(0, 20)) logger.warn(`unmatched: ${line}`)
  if (dryRun) logger.info("DRY_RUN=1 — nothing written. Re-run without DRY_RUN to apply.")
}
