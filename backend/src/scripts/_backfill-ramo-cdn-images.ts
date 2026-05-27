/**
 * Backfill colour-specific images for Ramo products by hitting Ramo's
 * predictable CDN URL pattern. The original CSV import only attached
 * `product_image_hero_url` + the (often identical) `product_image_url`
 * per variant, so most products ended up with a single image.
 *
 * URL pattern (from Ramo's catalogue):
 *   https://www.ramo.com.au/persistent/catalogue_images/products/{STYLE}_{COLOUR}.jpg
 *
 * Where:
 *   STYLE   = parent code, upper-cased (e.g. "AP401S", "B101BL")
 *   COLOUR  = colour name with every non-alphanumeric char replaced by `_`,
 *             each word Title_Cased (e.g. "Royal Blue" → "Royal_Blue",
 *             "Jean Blue / Natural" → "Jean_Blue___Natural")
 *
 * Strategy:
 *   1. Walk every ramo-* product with its variants (id, options).
 *   2. Build candidate URL set: hero (_1.jpg) + one URL per distinct
 *      Colour option value across all variants.
 *   3. HEAD-check each candidate URL. Keep only the 200-OK ones.
 *   4. Merge with the product's existing images[] (dedup by URL), set
 *      thumbnail if missing, and persist via updateProducts.
 *
 * Throttled to ~10 req/sec (100ms between HEADs). Per-URL timeout 8s.
 *
 * Run locally:
 *   pnpm --filter backend exec medusa exec src/scripts/_backfill-ramo-cdn-images.ts
 *   pnpm --filter backend exec medusa exec src/scripts/_backfill-ramo-cdn-images.ts -- --apply
 *
 * Run on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/_backfill-ramo-cdn-images.js -- --apply
 *
 * Env:
 *   RAMO_CDN_LIMIT=N      cap how many products to process (testing)
 *   RAMO_CDN_APPLY=1      same as passing --apply
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const CDN_BASE =
  "https://www.ramo.com.au/persistent/catalogue_images/products/"
const FETCH_TIMEOUT_MS = 8000
const DELAY_MS = 100 // ~10 req/sec
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const getApplyFlag = (args: string[] | undefined): boolean =>
  (args ?? []).includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.RAMO_CDN_APPLY === "1" ||
  process.env.RAMO_CDN_APPLY === "true"

const extractStyleFromHandle = (handle: string): string | null => {
  const m = handle.match(/^ramo-(.+)$/)
  if (!m) return null
  // Style codes are alphanumeric in Ramo's catalogue (e.g. AP401S, B101BL,
  // T449MS). Uppercase + strip dashes the slugifier may have introduced.
  return m[1]!.replace(/-/g, "").toUpperCase()
}

/**
 * "Royal Blue"            → "Royal_Blue"
 * "hot pink"              → "Hot_Pink"
 * "Jean Blue / Natural"   → "Jean_Blue___Natural"
 * "Black/White"           → "Black_White"
 *
 * Rule (verified against the existing upload-map): every non-alphanumeric
 * char becomes `_`, and each `_`-separated word is Title-cased.
 */
const colourToUrlSlug = (raw: string): string => {
  const replaced = raw.replace(/[^A-Za-z0-9]/g, "_")
  return replaced
    .split("_")
    .map((seg) =>
      seg.length === 0
        ? ""
        : seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase()
    )
    .join("_")
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

type RamoProduct = {
  id: string
  handle: string
  thumbnail: string | null
  images: Array<{ url: string }>
  variants: Array<{
    id: string
    options: Array<{ value: string | null; option: { title: string } | null }>
  }>
}

const collectColours = (p: RamoProduct): string[] => {
  const set = new Set<string>()
  for (const v of p.variants ?? []) {
    for (const o of v.options ?? []) {
      if (!o.option || (o.option.title ?? "").toLowerCase() !== "colour") {
        continue
      }
      const val = (o.value ?? "").trim()
      if (val && val.toLowerCase() !== "default") {
        set.add(val)
      }
    }
  }
  return Array.from(set)
}

export default async function backfillRamoCdnImages({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const apply = getApplyFlag(args)
  const limitEnv = Number.parseInt(process.env.RAMO_CDN_LIMIT ?? "", 10)
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : Infinity

  logger.info(`Ramo CDN image backfill — ${apply ? "APPLY" : "DRY RUN"}`)
  if (limit !== Infinity) logger.info(`Cap: RAMO_CDN_LIMIT=${limit}`)

  const { data: all } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "thumbnail",
      "images.url",
      "variants.id",
      "variants.options.value",
      "variants.options.option.title",
    ],
    filters: { handle: { $like: "ramo-%" } },
    pagination: { take: 5000 },
  })
  const products = (all ?? []) as RamoProduct[]
  logger.info(`Found ${products.length} ramo-* products.`)

  let processed = 0
  let noColours = 0
  let addedTotal = 0
  let missedTotal = 0
  let updatedProducts = 0
  let skippedNothingNew = 0

  for (const p of products) {
    if (processed >= limit) break
    processed++

    const style = extractStyleFromHandle(p.handle)
    if (!style) {
      logger.warn(`  [${processed}] ${p.handle}: bad handle, skip`)
      continue
    }

    const existingUrls = new Set(
      (p.images ?? []).map((i) => i.url).filter(Boolean)
    )

    const colours = collectColours(p)
    if (colours.length === 0) {
      noColours++
      // No colour options — only worth probing the hero `_1.jpg`. If we
      // already have it, skip. Otherwise check once.
      const heroUrl = `${CDN_BASE}${style}_1.jpg`
      if (existingUrls.has(heroUrl)) {
        skippedNothingNew++
        continue
      }
      if (await headOk(heroUrl)) {
        existingUrls.add(heroUrl)
        if (apply) {
          try {
            await productModule.updateProducts(p.id, {
              thumbnail: p.thumbnail || heroUrl,
              images: Array.from(existingUrls).map((url) => ({ url })),
            })
            updatedProducts++
            addedTotal++
            logger.info(`  [${processed}] ${p.handle}: +1 hero ✓`)
          } catch (e: any) {
            logger.warn(
              `  [${processed}] ${p.handle}: update failed — ${e?.message ?? e}`
            )
          }
        } else {
          addedTotal++
          logger.info(`  [${processed}] [dry] ${p.handle}: would add hero ${heroUrl}`)
        }
      } else {
        missedTotal++
      }
      await sleep(DELAY_MS)
      continue
    }

    // Probe hero + each colour URL.
    const candidates = [
      `${CDN_BASE}${style}_1.jpg`,
      ...colours.map((c) => `${CDN_BASE}${style}_${colourToUrlSlug(c)}.jpg`),
    ]
    const toCheck = candidates.filter((u) => !existingUrls.has(u))
    if (toCheck.length === 0) {
      skippedNothingNew++
      continue
    }

    const added: string[] = []
    const missed: string[] = []
    for (const url of toCheck) {
      if (await headOk(url)) {
        added.push(url)
      } else {
        missed.push(url)
      }
      await sleep(DELAY_MS)
    }

    if (added.length === 0) {
      missedTotal += missed.length
      logger.info(
        `  [${processed}] ${p.handle} (${style}): 0/${toCheck.length} hits`
      )
      continue
    }

    addedTotal += added.length
    missedTotal += missed.length
    for (const u of added) existingUrls.add(u)

    if (apply) {
      try {
        await productModule.updateProducts(p.id, {
          thumbnail: p.thumbnail || added[0],
          images: Array.from(existingUrls).map((url) => ({ url })),
        })
        updatedProducts++
        logger.info(
          `  [${processed}] ${p.handle} (${style}): +${added.length} / -${missed.length} ✓`
        )
      } catch (e: any) {
        logger.warn(
          `  [${processed}] ${p.handle}: update failed — ${e?.message ?? e}`
        )
      }
    } else {
      logger.info(
        `  [${processed}] [dry] ${p.handle} (${style}): would add ${added.length}, missed ${missed.length}`
      )
      if (processed <= 5) {
        for (const u of added) logger.info(`        +${u}`)
        for (const u of missed) logger.info(`        ×${u}`)
      }
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Processed:           ${processed}`)
  logger.info(`No colour options:   ${noColours}`)
  logger.info(`Skipped (no new):    ${skippedNothingNew}`)
  logger.info(`URLs added:          ${addedTotal}`)
  logger.info(`URLs missed (404):   ${missedTotal}`)
  logger.info(
    `Products updated:    ${updatedProducts}${apply ? "" : " (dry run — no writes)"}`
  )
}
