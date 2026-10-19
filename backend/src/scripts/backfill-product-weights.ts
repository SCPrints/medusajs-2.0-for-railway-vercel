/**
 * Backfill `product.weight` (grams) from an estimated type → grams table.
 *
 * Why: Standard Shipping is priced from a live Shippit quote, and Shippit
 * prices purely on consignment weight. Almost nothing in the catalog has a
 * weight, so every line falls back to SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS
 * (300 g) — tees over-quote by ~50 %, hoodies under-quote by ~45 %.
 *
 * Rules:
 *   - Only products with a null/0 `product.weight` are touched.
 *   - Products where ANY variant already carries a weight are skipped too
 *     (JB's Wear variants have real carton-derived weights; cart-weight.ts
 *     reads the variant first, so the product value is irrelevant there).
 *   - Types not in GARMENT_WEIGHT_GRAMS_BY_TYPE (lib/garment-weights.ts) are
 *     skipped and counted per type so the table can be extended.
 *   - Variants are never written.
 *
 * Flags:
 *   DRY_RUN=1 — per-type counts + 10 sample handles, writes nothing.
 *
 * Idempotent — re-run any time.
 *
 * Local:    cd backend && DRY_RUN=1 npx medusa exec src/scripts/backfill-product-weights.ts
 * Fly.io:   fly ssh console --app sc-prints-backend
 *           cd /app/.medusa/server && DRY_RUN=1 npx medusa exec src/scripts/backfill-product-weights.js
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { pickGarmentWeightGrams } from "../lib/garment-weights"

type ProductRow = {
  id: string
  handle: string | null
  weight: number | string | null
  type: { value: string | null } | null
  variants: Array<{ weight: number | string | null }> | null
}

const PAGE_SIZE = 200
const WRITE_BATCH = 25

const hasWeight = (raw: unknown): boolean => {
  const n = typeof raw === "string" ? Number.parseFloat(raw) : raw
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

const bump = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1)

export default async function backfillProductWeights({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  if (dryRun) logger.info("DRY_RUN=1 — no writes will be performed")

  let scanned = 0
  let alreadyWeighted = 0
  let variantWeighted = 0
  const toWrite: Array<{ id: string; handle: string | null; type: string; grams: number }> = []
  const plannedByType = new Map<string, number>()
  const skippedByType = new Map<string, number>()

  let offset = 0
  while (true) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "weight", "type.value", "variants.weight"],
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    const rows = (data ?? []) as ProductRow[]
    if (!rows.length) break

    for (const p of rows) {
      scanned++
      if (hasWeight(p.weight)) {
        alreadyWeighted++
        continue
      }
      if ((p.variants ?? []).some((v) => hasWeight(v.weight))) {
        variantWeighted++
        continue
      }
      const type = p.type?.value?.trim() || "(no type)"
      const grams = pickGarmentWeightGrams(type)
      if (grams === null) {
        bump(skippedByType, type)
        continue
      }
      bump(plannedByType, type)
      toWrite.push({ id: p.id, handle: p.handle, type, grams })
    }

    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const fmt = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `  ${k}: ${n}`)

  logger.info("---")
  logger.info(`Scanned ${scanned} product(s).`)
  logger.info(`Already weighted (product.weight set): ${alreadyWeighted}`)
  logger.info(`Skipped — a variant carries a real weight: ${variantWeighted}`)
  logger.info(`To set from the type table: ${toWrite.length}`)
  for (const line of fmt(plannedByType)) logger.info(line)
  logger.info(`Skipped — type not in table: ${[...skippedByType.values()].reduce((a, b) => a + b, 0)}`)
  for (const line of fmt(skippedByType)) logger.info(line)
  logger.info("Sample:")
  for (const s of toWrite.slice(0, 10)) logger.info(`  ${s.handle} (${s.type}) → ${s.grams} g`)

  if (dryRun) {
    logger.info("DRY_RUN=1 — nothing written.")
    return
  }

  let written = 0
  let failures = 0
  for (let i = 0; i < toWrite.length; i += WRITE_BATCH) {
    const batch = toWrite.slice(i, i + WRITE_BATCH)
    await Promise.all(
      batch.map(async (s) => {
        try {
          await productModule.updateProducts(s.id, { weight: s.grams })
          written++
        } catch (err: any) {
          failures++
          logger.warn(`Failed ${s.handle} (${s.id}): ${err?.message ?? err}`)
        }
      })
    )
  }

  logger.info("---")
  logger.info(`Written: ${written}, failures: ${failures}. Done.`)
}
