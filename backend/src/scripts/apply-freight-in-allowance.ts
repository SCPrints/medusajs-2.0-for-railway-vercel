/**
 * Reprice: move every laddered garment variant's per-unit freight-in
 * allowance to the current FREIGHT_IN_ALLOWANCE_AUD (utils/bulk-price-ladder.ts).
 *
 * 2026-08-27 it baked $15 in (full at 1-9, amortized over the band minimum
 * above). 2026-10-19 the constant went to 0 — freight-in is charged once per
 * order in the shipping bands instead — so the same script now takes it back
 * out. It works on the DELTA between the variant's `bulk_pricing.freight_in_aud`
 * stamp (unstamped = 0) and the constant, so it is idempotent and re-runnable
 * at any value. Unstamped ladders created while the allowance was 15 are
 * treated as carrying it (see UNSTAMPED_FREIGHT_WINDOW).
 *
 * For each variant with `metadata.bulk_pricing.tiers` whose stamp differs:
 *   - adds `delta / max(1, min_quantity)` to each tier amount
 *   - mirrors the change onto the legacy flat fields
 *   - rewrites the variant's AUD price rows from the updated tiers (heals any
 *     row/metadata drift at the same time — metadata is what the cart charges)
 *   - stamps `bulk_pricing.freight_in_aud` = the constant
 *
 * Skipped (and counted): variants already at the constant (drift-repaired if
 * their price rows disagree with metadata), variants with `bulk_pricing` but
 * no tiers array (legacy flat-fields-only — none expected), and variants with
 * no bulk_pricing at all (services, decoration products — freight doesn't
 * apply).
 *
 * Drift repair: a stamped variant whose AUD price rows don't match its
 * metadata tiers (metadata committed but the price-set step failed — happened
 * when Redis OOM'd mid-run on 2026-08-27) gets its price rows rewritten from
 * the metadata. Metadata is untouched, so this is safe to re-run.
 *
 * After a real run: reindex Meilisearch (min_price_aud) + purge the
 * storefront product cache.
 *
 *   DRY_RUN=1 npx medusa exec src/scripts/apply-freight-in-allowance.js
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"

import { FREIGHT_IN_ALLOWANCE_AUD } from "../utils/bulk-price-ladder"

const PAGE_SIZE = 100
const CHUNK = 20

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Ladders built while FREIGHT_IN_ALLOWANCE_AUD was 15 but NOT stamped: the
 * JB's Wear family (2026-10-14) and the nightly AS Colour / FashionBiz
 * variant backfills write `bulk_pricing` through their own metadata builders,
 * which never copied the stamp. The 2026-08-27 run stamped everything that
 * existed before it, and ladders built after this constant went to 0 carry
 * nothing — so "unstamped + created inside the window" ⇔ carries $15.
 * ponytail: window end = the 2026-10-19 backend deploy; widen if a
 * later import is found carrying freight.
 */
const UNSTAMPED_FREIGHT_WINDOW = {
  from: Date.parse("2026-08-27T00:00:00Z"),
  to: Date.parse("2026-10-18T22:00:00Z"),
  allowance: 15,
}
const impliedFreight = (createdAt: unknown): number => {
  const t = Date.parse(String(createdAt ?? ""))
  return t >= UNSTAMPED_FREIGHT_WINDOW.from && t < UNSTAMPED_FREIGHT_WINDOW.to
    ? UNSTAMPED_FREIGHT_WINDOW.allowance
    : 0
}

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
  let driftRepaired = 0
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
      metadata?: Record<string, unknown>
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
      fields: [
        "id",
        "handle",
        "variants.id",
        "variants.sku",
        "variants.created_at",
        "variants.metadata",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "variants.prices.min_quantity",
      ],
      pagination: { skip, take: PAGE_SIZE },
    })
    const products = (data ?? []) as Array<{
      id: string
      handle: string | null
      variants?: Array<{
        id: string
        sku: string | null
        created_at?: unknown
        metadata: Record<string, unknown> | null
        prices?: Array<{
          amount: unknown
          currency_code: string | null
          min_quantity: unknown
        }> | null
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
        const tiers = bulk.tiers as Array<Record<string, unknown>> | undefined
        const stamped =
          toFinite(bulk.freight_in_aud) ?? impliedFreight(variant.created_at)
        const delta = round2(FREIGHT_IN_ALLOWANCE_AUD - stamped)
        const perUnit = (minQty: number) => round2(delta / Math.max(1, minQty))
        if (delta === 0) {
          alreadyStamped++
          // Drift repair: metadata already carries the allowance, but the
          // price-set write may have failed mid-run. If the AUD rows don't
          // match the metadata tiers, rewrite the rows (metadata untouched).
          if (Array.isArray(tiers) && tiers.length) {
            const currency =
              typeof bulk.currency_code === "string" && bulk.currency_code
                ? bulk.currency_code
                : "aud"
            const rows = (variant.prices ?? []).filter(
              (p) => (p.currency_code ?? "aud").toLowerCase() === currency
            )
            const rowByMin = new Map<number, number>()
            for (const p of rows) {
              const minQty = toFinite(p.min_quantity) ?? 1
              const amount = toFinite(p.amount)
              if (amount !== null) rowByMin.set(minQty, amount)
            }
            const drifted = tiers.some((tier) => {
              const minQty = toFinite(tier.min_quantity)
              const amount = toFinite(tier.amount)
              if (minQty === null || amount === null) return false
              const row = rowByMin.get(minQty)
              return row === undefined || Math.abs(row - amount) > 0.005
            })
            if (drifted) {
              const prices: PriceBand[] = []
              for (const tier of tiers) {
                const minQty = toFinite(tier.min_quantity)
                const amount = toFinite(tier.amount)
                if (minQty === null || amount === null) continue
                const maxQty = toFinite(tier.max_quantity)
                prices.push({
                  currency_code: currency,
                  amount,
                  min_quantity: minQty,
                  ...(maxQty !== null ? { max_quantity: maxQty } : {}),
                })
              }
              if (prices.length) {
                variantPayloads.push({ id: variant.id, prices })
                driftRepaired++
                if (sampleLines.length < 10) {
                  sampleLines.push(
                    `${product.handle} ${variant.sku ?? variant.id}: drift-repaired price rows (1-9 row $${rowByMin.get(1) ?? "?"} → $${toFinite(tiers[0]?.amount)})`
                  )
                }
              }
            }
          }
          continue
        }
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
            amount: round2(amount + perUnit(minQty)),
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
            newBulk[field] = round2(current + perUnit(minQty))
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
            `${product.handle} ${variant.sku ?? variant.id}: freight $${stamped} → $${FREIGHT_IN_ALLOWANCE_AUD}, 1-9 $${oldBase} → $${newTiers[0]?.amount}`
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
  logger.info(`freight allowance:      $${FREIGHT_IN_ALLOWANCE_AUD} per band-min unit (target)`)
  logger.info(`products touched:       ${productsTouched}`)
  logger.info(`variants repriced:      ${variantsBumped}`)
  logger.info(`already at target:      ${alreadyStamped} (skipped)`)
  logger.info(`drift repaired:         ${driftRepaired} (price rows rewritten from metadata)`)
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
