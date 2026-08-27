/**
 * One-off reprice: bake the inbound freight-in allowance into every existing
 * laddered garment variant (decided 2026-08-27 — see FREIGHT_IN_ALLOWANCE_AUD
 * in utils/bulk-price-ladder.ts).
 *
 * For each variant with `metadata.bulk_pricing.tiers`:
 *   - adds `FREIGHT_IN_ALLOWANCE_AUD / max(1, min_quantity)` to each tier
 *     amount ($15 at 1-9, $1.50 at 10-19, $0.75 at 20-49, $0.30 at 50-99,
 *     $0.15 at 100+)
 *   - mirrors the bump onto the legacy flat fields
 *   - rewrites the variant's AUD price rows from the updated tiers (heals any
 *     row/metadata drift at the same time — metadata is what the cart charges)
 *   - stamps `bulk_pricing.freight_in_aud` for idempotency (newly imported
 *     variants arrive pre-stamped via buildBulkPricingMetadata)
 *
 * Skipped (and counted): variants already stamped, variants with
 * `bulk_pricing` but no tiers array (legacy flat-fields-only — none expected),
 * and variants with no bulk_pricing at all (services, decoration products —
 * freight doesn't apply).
 *
 * After a real run: reindex Meilisearch (min_price_aud) + purge the
 * storefront product cache.
 *
 *   DRY_RUN=1 npx medusa exec src/scripts/apply-freight-in-allowance.js
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

import {
  FREIGHT_IN_ALLOWANCE_AUD,
  freightInPerUnit,
} from "../utils/bulk-price-ladder"

const PAGE_SIZE = 100
const CHUNK = 20

const round2 = (n: number) => Math.round(n * 100) / 100

const toFinite = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

// Legacy flat fields keyed by the band minimum they mirror.
const FLAT_FIELD_MIN_QTY: Record<string, number> = {
  base_sale_price: 1,
  tier_10_to_19_price: 10,
  tier_20_to_49_price: 20,
  tier_50_to_99_price: 50,
  tier_100_plus_price: 100,
}

export default async function applyFreightInAllowance({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const dryRun = process.env.DRY_RUN === "1"
  const limit = Number(process.env.LIMIT) > 0 ? Number(process.env.LIMIT) : Infinity

  let skip = 0
  let productsTouched = 0
  let variantsBumped = 0
  let alreadyStamped = 0
  let noBulkPricing = 0
  let noTiersArray = 0
  let badTierAmounts = 0
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
    const products = (data ?? []) as Array<{
      id: string
      handle: string | null
      variants?: Array<{
        id: string
        sku: string | null
        metadata: Record<string, unknown> | null
      }>
    }>
    if (!products.length) break

    for (const product of products) {
      const variantPayloads: ProductPayload["variants"] = []

      for (const variant of product.variants ?? []) {
        const meta = (variant.metadata ?? {}) as Record<string, unknown>
        const bulk = meta.bulk_pricing as Record<string, unknown> | undefined
        if (!bulk || typeof bulk !== "object") {
          noBulkPricing++
          continue
        }
        if (toFinite(bulk.freight_in_aud) !== null) {
          alreadyStamped++
          continue
        }
        const tiers = bulk.tiers as Array<Record<string, unknown>> | undefined
        if (!Array.isArray(tiers) || !tiers.length) {
          noTiersArray++
          continue
        }

        const newTiers: Array<Record<string, unknown>> = []
        let bad = false
        for (const tier of tiers) {
          const minQty = toFinite(tier.min_quantity)
          const amount = toFinite(tier.amount)
          if (minQty === null || amount === null) {
            bad = true
            break
          }
          newTiers.push({
            ...tier,
            amount: round2(amount + freightInPerUnit(minQty)),
          })
        }
        if (bad) {
          badTierAmounts++
          continue
        }

        const newBulk: Record<string, unknown> = {
          ...bulk,
          tiers: newTiers,
          freight_in_aud: FREIGHT_IN_ALLOWANCE_AUD,
        }
        for (const [field, minQty] of Object.entries(FLAT_FIELD_MIN_QTY)) {
          const current = toFinite(bulk[field])
          if (current !== null) {
            newBulk[field] = round2(current + freightInPerUnit(minQty))
          }
        }

        const currency =
          typeof bulk.currency_code === "string" && bulk.currency_code
            ? bulk.currency_code
            : "aud"
        const prices: PriceBand[] = newTiers.map((tier) => {
          const maxQty = toFinite(tier.max_quantity)
          return {
            currency_code: currency,
            amount: tier.amount as number,
            min_quantity: tier.min_quantity as number,
            ...(maxQty !== null ? { max_quantity: maxQty } : {}),
          }
        })

        variantPayloads.push({
          id: variant.id,
          // Medusa update REPLACES metadata jsonb — spread the full existing
          // metadata or every other key is wiped.
          metadata: { ...meta, bulk_pricing: newBulk },
          prices,
        })
        variantsBumped++
        if (sampleLines.length < 10) {
          const oldBase = toFinite(tiers[0]?.amount)
          sampleLines.push(
            `${product.handle} ${variant.sku ?? variant.id}: 1-9 $${oldBase} → $${newTiers[0]?.amount}`
          )
        }
      }

      if (variantPayloads.length) {
        productsTouched++
        pendingChunk.push({ id: product.id, variants: variantPayloads })
        if (pendingChunk.length >= CHUNK) {
          await flush()
          logger.info(
            `progress: ${productsTouched} products / ${variantsBumped} variants${dryRun ? " (dry run)" : ""}`
          )
        }
        if (productsTouched >= limit) break outer
      }
    }
    skip += PAGE_SIZE
  }
  await flush()

  logger.info(`--- apply-freight-in-allowance ${dryRun ? "DRY RUN " : ""}summary ---`)
  logger.info(`freight allowance:      $${FREIGHT_IN_ALLOWANCE_AUD} per band-min unit`)
  logger.info(`products touched:       ${productsTouched}`)
  logger.info(`variants bumped:        ${variantsBumped}`)
  logger.info(`already stamped:        ${alreadyStamped} (skipped)`)
  logger.info(`no bulk_pricing:        ${noBulkPricing} (skipped — services/decoration)`)
  logger.info(`bulk_pricing w/o tiers: ${noTiersArray} (skipped — inspect if > 0)`)
  logger.info(`unparseable tiers:      ${badTierAmounts} (skipped — inspect if > 0)`)
  for (const line of sampleLines) logger.info(`sample: ${line}`)
  if (dryRun) logger.info("DRY_RUN=1 — nothing written. Re-run without DRY_RUN to apply.")
  else
    logger.info(
      "Now reindex Meilisearch (src/scripts/reindex-meilisearch.js) and purge the storefront product cache."
    )
}
