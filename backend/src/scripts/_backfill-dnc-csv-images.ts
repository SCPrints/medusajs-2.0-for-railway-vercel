/**
 * Backfill colour-specific images for DNC products by hitting DNC's
 * predictable CDN URL pattern. DNC variant SKUs encode the image:
 *
 *   ProductCode 110110061 (Trad Chef Jacket S/S Black XXS)
 *     SKU minus last 2 chars = 1101100
 *     → https://www.dncworkwear.com.au/images/hires/1101100.jpg
 *
 *   ProductCode 110134961 (Trad Chef Jacket S/S White XXS)
 *     SKU minus last 2 chars = 1101349
 *     → https://www.dncworkwear.com.au/images/hires/1101349.jpg
 *
 * Last 2 chars = size code (61=XXS, 62=XS, ...); the remainder = style +
 * 3-digit colour code. Many variants per product share the same colour
 * code, so we deduplicate before probing.
 *
 * Strategy (same shape as _backfill-ramo-cdn-images.ts):
 *   1. Walk every dnc-* product with its variants (id, sku).
 *   2. Build candidate URL set per product: distinct codes derived from
 *      each variant's SKU.
 *   3. HEAD-check each candidate. Drop URLs already on the product.
 *   4. Merge survivors into images[], set thumbnail if missing.
 *
 * Throttled ~10 req/sec, 8s per-URL timeout.
 *
 * Run locally:
 *   pnpm --filter backend exec medusa exec src/scripts/_backfill-dnc-csv-images.ts
 *   pnpm --filter backend exec medusa exec src/scripts/_backfill-dnc-csv-images.ts -- --apply
 *
 * Run on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/_backfill-dnc-csv-images.js -- --apply
 *
 * Env:
 *   DNC_CDN_LIMIT=N    cap how many products to process (testing)
 *   DNC_CDN_APPLY=1    same as passing --apply
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const CDN_BASE = "https://www.dncworkwear.com.au/images/hires/"
const FETCH_TIMEOUT_MS = 8000
const DELAY_MS = 100 // ~10 req/sec
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const getApplyFlag = (args: string[] | undefined): boolean =>
  (args ?? []).includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.DNC_CDN_APPLY === "1" ||
  process.env.DNC_CDN_APPLY === "true"

/**
 * Strip the last 2 chars (size code) off the SKU. Returns null for SKUs
 * too short or with non-alphanumeric chars.
 *
 *   "110110061" → "1101100"
 *   "B00010004" → "B000100"
 *   "abc"        → null (no size suffix to drop confidently)
 */
const skuToImageCode = (sku: string): string | null => {
  const s = sku.trim()
  if (s.length < 4) return null
  if (!/^[A-Za-z0-9]+$/.test(s)) return null
  return s.slice(0, -2)
}

const headOk = async (url: string): Promise<boolean> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    })
    clearTimeout(timer)
    return res.ok
  } catch {
    clearTimeout(timer)
    return false
  }
}

type DncProduct = {
  id: string
  handle: string
  thumbnail: string | null
  images: Array<{ url: string }>
  variants: Array<{ id: string; sku: string | null }>
}

export default async function backfillDncCdnImages({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const apply = getApplyFlag(args)
  const limitEnv = Number.parseInt(process.env.DNC_CDN_LIMIT ?? "", 10)
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : Infinity

  logger.info(`DNC CDN image backfill — ${apply ? "APPLY" : "DRY RUN"}`)
  if (limit !== Infinity) logger.info(`Cap: DNC_CDN_LIMIT=${limit}`)

  const { data: all } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.url", "variants.id", "variants.sku"],
    filters: { handle: { $like: "dnc-%" } },
    pagination: { take: 5000 },
  })
  const products = (all ?? []) as DncProduct[]
  logger.info(`Found ${products.length} dnc-* products.`)

  let processed = 0
  let noCodes = 0
  let nothingNew = 0
  let addedTotal = 0
  let missedTotal = 0
  let updatedProducts = 0

  for (const p of products) {
    if (processed >= limit) break
    processed++

    const codes = new Set<string>()
    for (const v of p.variants ?? []) {
      const code = skuToImageCode(v.sku ?? "")
      if (code) codes.add(code)
    }

    if (codes.size === 0) {
      noCodes++
      logger.warn(`  [${processed}] ${p.handle}: no derivable codes, skip`)
      continue
    }

    const existingUrls = new Set(
      (p.images ?? []).map((i) => i.url).filter(Boolean)
    )
    const candidates = Array.from(codes).map((c) => `${CDN_BASE}${c}.jpg`)
    const toCheck = candidates.filter((u) => !existingUrls.has(u))
    if (toCheck.length === 0) {
      nothingNew++
      continue
    }

    const hits: string[] = []
    const misses: string[] = []
    for (const url of toCheck) {
      if (await headOk(url)) hits.push(url)
      else misses.push(url)
      await sleep(DELAY_MS)
    }

    if (hits.length === 0) {
      missedTotal += misses.length
      logger.info(
        `  [${processed}] ${p.handle}: 0/${toCheck.length} hits`
      )
      continue
    }

    addedTotal += hits.length
    missedTotal += misses.length
    for (const u of hits) existingUrls.add(u)

    if (apply) {
      try {
        await productModule.updateProducts(p.id, {
          thumbnail: p.thumbnail || hits[0],
          images: Array.from(existingUrls).map((url) => ({ url })),
        })
        updatedProducts++
        logger.info(
          `  [${processed}] ${p.handle}: +${hits.length} / -${misses.length} ✓`
        )
      } catch (e: any) {
        logger.warn(
          `  [${processed}] ${p.handle}: update failed — ${e?.message ?? e}`
        )
      }
    } else {
      logger.info(
        `  [${processed}] [dry] ${p.handle}: would add ${hits.length}, missed ${misses.length}`
      )
      if (processed <= 5) {
        for (const u of hits) logger.info(`        +${u}`)
        for (const u of misses) logger.info(`        ×${u}`)
      }
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Processed:              ${processed}`)
  logger.info(`No derivable codes:     ${noCodes}`)
  logger.info(`Nothing new:            ${nothingNew}`)
  logger.info(`URLs added:             ${addedTotal}`)
  logger.info(`URLs missed (404):      ${missedTotal}`)
  logger.info(
    `Products updated:       ${updatedProducts}${apply ? "" : " (dry run — no writes)"}`
  )
}
