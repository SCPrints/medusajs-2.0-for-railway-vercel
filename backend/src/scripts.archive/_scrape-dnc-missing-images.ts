/**
 * Scrape DNC's product pages to fill in missing thumbnails / images for
 * products whose CSV row had an empty Image cell. Idempotent — only
 * touches products with no thumbnail set.
 *
 * Strategy:
 *   1. Walk every dnc-* product without a thumbnail.
 *   2. Skip admin/junk codes (Z9002, ZXD*) — they shouldn't be in the
 *      catalog anyway.
 *   3. Reconstruct the DNC product URL from the handle: dnc-z929 →
 *      https://www.dncworkwear.com.au/Product/Z929
 *   4. Fetch the page, extract og:image / twitter:image meta tag.
 *   5. Stamp on `product.thumbnail` + `product.images[]`.
 *
 * Throttled to ~10 req/sec to be a good neighbour. Per-product timeout 8s.
 *
 * Run on production:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/_scrape-dnc-missing-images.js
 *
 * Env override: DNC_SCRAPE_LIMIT=N caps how many products to try (testing).
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { writeProductImages } from "../lib/safe-product-images"

const DNC_PRODUCT_URL_PREFIX = "https://www.dncworkwear.com.au/Product/"
const SKIP_PREFIXES = ["Z9002", "ZXD"] as const
const FETCH_TIMEOUT_MS = 8000
const DELAY_MS = 100 // 10 req/sec
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

const extractCodeFromHandle = (handle: string): string | null => {
  const m = handle.match(/^dnc-(.+)$/)
  return m ? m[1]!.toUpperCase() : null
}

const shouldSkip = (code: string): boolean => {
  const upper = code.toUpperCase()
  return SKIP_PREFIXES.some((p) => upper.startsWith(p))
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Tries og:image first, then twitter:image. Returns absolute URL or null.
 * Brittle but DNC's site is stable enough for a one-off.
 */
const extractHeroImage = (html: string): string | null => {
  const og = html.match(
    /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i
  )
  if (og?.[1]) return og[1]
  const ogRev = html.match(
    /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i
  )
  if (ogRev?.[1]) return ogRev[1]
  const tw = html.match(
    /<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i
  )
  if (tw?.[1]) return tw[1]
  return null
}

const fetchHeroImage = async (url: string): Promise<string | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    return extractHeroImage(html)
  } catch {
    clearTimeout(timer)
    return null
  }
}

export default async function scrapeDncMissingImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const limitEnv = Number.parseInt(process.env.DNC_SCRAPE_LIMIT ?? "", 10)
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : Infinity

  const { data: all } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail"],
    filters: { handle: { $like: "dnc-%" } },
    pagination: { take: 5000 },
  })
  const candidates = ((all ?? []) as Array<{
    id: string
    handle: string
    thumbnail: string | null
  }>).filter((p) => !p.thumbnail || !p.thumbnail.trim())

  logger.info(
    `Found ${candidates.length} dnc-* products without thumbnails.`
  )
  if (limit !== Infinity) {
    logger.info(`Cap: DNC_SCRAPE_LIMIT=${limit}`)
  }

  let scraped = 0
  let skipped = 0
  let notFound = 0
  let failed = 0
  let i = 0

  for (const p of candidates) {
    if (i >= limit) break
    i++

    const code = extractCodeFromHandle(p.handle)
    if (!code) {
      skipped++
      continue
    }
    if (shouldSkip(code)) {
      skipped++
      logger.info(`  [${i}/${candidates.length}] ${p.handle}: skip (admin code)`)
      continue
    }

    const url = `${DNC_PRODUCT_URL_PREFIX}${code}`
    const imageUrl = await fetchHeroImage(url)
    if (!imageUrl) {
      notFound++
      logger.warn(`  [${i}/${candidates.length}] ${p.handle}: no image at ${url}`)
      await sleep(DELAY_MS)
      continue
    }

    try {
      // HARD RULE 0/2: route through the safe chokepoint — it HEAD-validates
      // the scraped og:image (only a confirmed-live 200 is written) and
      // force-keeps any existing gallery images rather than wholesale-replacing.
      const writeResult = await writeProductImages(container, p.id, [imageUrl], {
        thumbnail: imageUrl,
        logger,
      })
      if (writeResult.wrote) {
        scraped++
        if (scraped <= 5 || scraped % 10 === 0) {
          logger.info(`  [${i}/${candidates.length}] ${p.handle}: ✓ ${imageUrl}`)
        }
      } else {
        // Not written — the scraped URL failed liveness validation (dead/unverified).
        notFound++
        logger.warn(
          `  [${i}/${candidates.length}] ${p.handle}: scraped image not live (${imageUrl})`
        )
      }
    } catch (e: any) {
      failed++
      logger.warn(
        `  [${i}/${candidates.length}] ${p.handle}: update failed — ${e?.message ?? e}`
      )
    }

    await sleep(DELAY_MS)
  }

  logger.info(
    `Done. Scraped=${scraped}, Skipped=${skipped} (admin/junk), Not found=${notFound}, Failed=${failed}.`
  )
}
