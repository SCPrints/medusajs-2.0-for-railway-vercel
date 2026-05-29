/**
 * Backfill correct, per-colour images for every RAMO product by reading
 * RAMO's product JSON API (`get_retail_product.cgi`), which exposes an
 * EXPLICIT colour → image-filename map plus the shared lifestyle shots.
 *
 * This supersedes `_backfill-ramo-cdn-images.ts` (which GUESSED CDN URLs as
 * `{STYLE}_{Colour}.jpg` and 404'd whenever RAMO's real filename differed —
 * e.g. RAMO stores `tp212h_lavender_front.jpg`, not `TP212H_Lavender.jpg`,
 * so Lavender / Sand / etc. ended up with no image and the PDP fell back to
 * showing the wrong (hero) colour).
 *
 * What it writes per product:
 *   - `product.images[]`           — model shots + every colour's front/back,
 *                                    merged with existing (dedup by filename).
 *   - `variant.metadata.garment_images = { front, all }` — per colour, so the
 *     storefront PDP gallery + swatch resolve the EXACT colour (this is the
 *     primary path: `getGarmentImageUrlsFromMetadata` in the storefront).
 *   - `product.metadata.ramo_web_name`        — cached so re-runs skip the
 *     sitemap walk for already-resolved products.
 *   - `product.metadata.ramo_model_image_urls`— shared lifestyle shots; the
 *     storefront uses these as the generic fallback for colours RAMO never
 *     photographed (instead of showing another colour's garment).
 *   - `product.metadata.ramo_image_sync_at`   — ISO stamp of the last sync.
 *
 * Resolution: our products are keyed by style code (handle `ramo-tp212h` →
 * `TP212H`); RAMO's API is keyed by `web_name` (name-based slug). We can't
 * derive one from the other, so we walk RAMO's product sitemap (≈314 entries),
 * fetch each product's API once (disk-cached, throttled), read its style from
 * the catalogue filename, and match. First run also stamps `ramo_web_name`
 * back onto our products so subsequent runs resolve instantly.
 *
 * Run locally (dry run):
 *   pnpm --filter backend exec medusa exec src/scripts/backfill-ramo-images-from-api.ts
 * Apply:
 *   pnpm --filter backend exec medusa exec src/scripts/backfill-ramo-images-from-api.ts -- --apply
 *
 * Production (Fly):
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/backfill-ramo-images-from-api.js -- --apply
 *
 * Env:
 *   RAMO_API_LIMIT=N        cap how many of OUR products to process (testing)
 *   RAMO_API_CACHE_DIR=...  disk cache for fetched API JSON (default /tmp/ramo-api-cache)
 *   RAMO_API_APPLY=1        same as passing --apply
 *   RAMO_API_NO_CACHE=1     ignore the disk cache (force re-fetch)
 */

import fs from "node:fs"
import path from "node:path"
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  parseRamoProductApi,
  matchColoursToVariants,
  imageFilenameKey,
  type RamoParsedProduct,
} from "../lib/ramo-product-api"

const SITEMAP_URL = "https://online.ramo.com.au/sitemap_products.xml"
const API_BASE = "https://www.ramo.com.au/cgi/get_retail_product.cgi?webname="
const FETCH_TIMEOUT_MS = 12000
const DELAY_MS = 150 // ~6 req/sec — polite against RAMO's Cloudflare front
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const getApplyFlag = (args: string[] | undefined): boolean =>
  (args ?? []).includes("--apply") ||
  process.argv.includes("--apply") ||
  process.env.RAMO_API_APPLY === "1" ||
  process.env.RAMO_API_APPLY === "true"

/** Style code from our product handle: `ramo-tp212h` → `TP212H`. */
const styleFromHandle = (handle: string): string | null => {
  const m = handle.match(/^ramo-(.+)$/)
  if (!m) return null
  return m[1]!.replace(/-/g, "").toUpperCase()
}

const COLOUR_OPTION_RE = /colou?r/i

type OurVariant = {
  id: string
  options?: Array<{ value: string | null; option: { title: string } | null }>
  metadata?: Record<string, unknown> | null
}
type OurProduct = {
  id: string
  handle: string
  thumbnail: string | null
  images: Array<{ url: string }>
  metadata: Record<string, unknown> | null
  variants: OurVariant[]
}

const colourOfVariant = (v: OurVariant): string | null => {
  for (const o of v.options ?? []) {
    if (o.option && COLOUR_OPTION_RE.test(o.option.title ?? "")) {
      const val = (o.value ?? "").trim()
      if (val) return val
    }
  }
  return null
}

// ---- disk cache for fetched API JSON -------------------------------------
const cachePathFor = (dir: string, webName: string): string =>
  path.join(dir, `${webName.replace(/[^a-z0-9_-]/gi, "_")}.json`)

const readApiCache = (file: string): unknown | null => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return null
  }
}
const writeApiCache = (file: string, json: unknown): void => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(json), "utf8")
  } catch {
    /* cache write failures are non-fatal */
  }
}

const fetchText = async (url: string): Promise<string | null> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, accept: "application/json,*/*" },
      signal: controller.signal,
      redirect: "follow",
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.text()
  } catch {
    clearTimeout(timer)
    return null
  }
}

export default async function backfillRamoImagesFromApi({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const apply = getApplyFlag(args)
  const noCache = process.env.RAMO_API_NO_CACHE === "1" || process.env.RAMO_API_NO_CACHE === "true"
  const cacheDir = process.env.RAMO_API_CACHE_DIR || "/tmp/ramo-api-cache"
  const limitEnv = Number.parseInt(process.env.RAMO_API_LIMIT ?? "", 10)
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? limitEnv : Infinity

  logger.info(`RAMO image backfill (API) — ${apply ? "APPLY" : "DRY RUN"}`)
  if (limit !== Infinity) logger.info(`Cap: RAMO_API_LIMIT=${limit}`)

  // ---- load our RAMO products ------------------------------------------
  const { data: rows } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "thumbnail",
      "images.url",
      "metadata",
      "variants.id",
      "variants.metadata",
      "variants.options.value",
      "variants.options.option.title",
    ],
    filters: { handle: { $like: "ramo-%" } },
    pagination: { take: 5000 },
  })
  let products = (rows ?? []) as OurProduct[]
  if (limit !== Infinity) products = products.slice(0, limit)
  logger.info(`Loaded ${products.length} ramo-* products.`)

  // style → our product(s). (One product per style, but guard for dupes.)
  const byStyle = new Map<string, OurProduct>()
  for (const p of products) {
    const style = styleFromHandle(p.handle)
    if (style) byStyle.set(style, p)
  }
  const stylesNeeded = new Set(byStyle.keys())

  // ---- resolve style → web_name + parsed product -----------------------
  // Walk the FULL product sitemap, fetch each product's API (disk-cached),
  // and keep the RICHEST listing per style. RAMO sometimes carries duplicate
  // / seasonal listings for one style (e.g. `regular-adults-tee` +
  // `regular-adults-tee-13`, where the latter only stocks a few colours); the
  // listing with the most colours is the canonical one. The per-web_name JSON
  // cache makes re-runs cheap, so a full walk (no early stop) is fine.
  const parsedByStyle = new Map<string, { webName: string; parsed: RamoParsedProduct }>()
  const bestByStyle = new Map<
    string,
    { webName: string; parsed: RamoParsedProduct; colours: number }
  >()

  const consider = (webName: string, json: unknown): void => {
    const parsed = json ? parseRamoProductApi(json) : null
    if (!parsed || !parsed.styleCode || !stylesNeeded.has(parsed.styleCode)) return
    const colours = Object.keys(parsed.colourImages).length
    const cur = bestByStyle.get(parsed.styleCode)
    if (!cur || colours > cur.colours) {
      bestByStyle.set(parsed.styleCode, { webName, parsed, colours })
    }
  }

  logger.info(`Resolving ${stylesNeeded.size} style(s) via sitemap walk (cache: ${cacheDir})…`)
  const sitemapXml = await fetchText(SITEMAP_URL)
  const webNames: string[] = []
  if (sitemapXml) {
    const seen = new Set<string>()
    for (const m of sitemapXml.matchAll(/\/shop\/item\/([^<\s"']+)/g)) {
      const wn = m[1]!.trim()
      if (wn && !seen.has(wn)) {
        seen.add(wn)
        webNames.push(wn)
      }
    }
  }
  logger.info(`Sitemap: ${webNames.length} product URLs.`)

  let walked = 0
  for (const webName of webNames) {
    walked++
    const file = cachePathFor(cacheDir, webName)
    let json = noCache ? null : readApiCache(file)
    const fromCache = !!json
    if (!json) {
      const text = await fetchText(`${API_BASE}${encodeURIComponent(webName)}`)
      if (text) {
        try {
          json = JSON.parse(text)
          if (!noCache) writeApiCache(file, json)
        } catch {
          json = null
        }
      }
    }
    consider(webName, json)
    if (!fromCache) await sleep(DELAY_MS)
    if (walked % 50 === 0) {
      logger.info(`  …walked ${walked}/${webNames.length}, ${bestByStyle.size} resolved`)
    }
  }

  for (const [style, best] of bestByStyle) {
    parsedByStyle.set(style, { webName: best.webName, parsed: best.parsed })
    stylesNeeded.delete(style)
    logger.info(`  ↳ ${style} → ${best.webName} (${best.colours} colours)`)
  }

  if (stylesNeeded.size > 0) {
    logger.warn(
      `Unresolved styles (no RAMO sitemap match): ${Array.from(stylesNeeded).join(", ")}`
    )
  }

  // ---- apply per product -----------------------------------------------
  let productsUpdated = 0
  let variantsUpdated = 0
  let imagesAddedTotal = 0
  const unmatchedReport: string[] = []

  for (const p of products) {
    const style = styleFromHandle(p.handle)
    if (!style) continue
    const resolved = parsedByStyle.get(style)
    if (!resolved) continue
    const { webName, parsed } = resolved

    // colour values present on this product's variants
    const ourColours = Array.from(
      new Set(
        p.variants
          .map(colourOfVariant)
          .filter((c): c is string => typeof c === "string" && c.length > 0)
      )
    )
    const { matched, unmatched } = matchColoursToVariants(ourColours, parsed.colourImages)
    if (unmatched.length) {
      unmatchedReport.push(`${p.handle}: ${unmatched.join(", ")}`)
    }

    // merge product images: RAMO gallery first (authoritative order), then any
    // existing extras not already present (dedup by filename basename).
    const existingUrls = (p.images ?? []).map((i) => i.url).filter(Boolean)
    const seen = new Set<string>()
    const mergedImages: string[] = []
    for (const url of [...parsed.gallery, ...existingUrls]) {
      const key = imageFilenameKey(url)
      if (!key || seen.has(key)) continue
      seen.add(key)
      mergedImages.push(url)
    }
    const addedCount = Math.max(0, mergedImages.length - existingUrls.length)

    const productMeta = {
      ...(p.metadata ?? {}),
      ramo_web_name: webName,
      ramo_model_image_urls: parsed.modelImageUrls,
      ramo_image_sync_at: new Date().toISOString(),
    }

    // per-variant garment_images for matched colours
    const variantWrites: Array<{ id: string; metadata: Record<string, unknown> }> = []
    for (const v of p.variants) {
      const colour = colourOfVariant(v)
      if (!colour) continue
      const imgs = matched[colour]
      if (!imgs) continue
      variantWrites.push({
        id: v.id,
        metadata: {
          ...((v.metadata ?? {}) as Record<string, unknown>),
          garment_images: { front: imgs.front, all: imgs.all },
        },
      })
    }

    logger.info(
      `  ${p.handle} (${style} ← ${webName}): ${Object.keys(matched).length}/${ourColours.length} colours matched, +${addedCount} images, ${variantWrites.length} variants`
    )

    if (!apply) {
      continue
    }

    try {
      await productModule.updateProducts(p.id, {
        images: mergedImages.map((url) => ({ url })),
        thumbnail: p.thumbnail || mergedImages[0] || undefined,
        metadata: productMeta,
      })
      productsUpdated++
      imagesAddedTotal += addedCount
    } catch (e: any) {
      logger.warn(`    product update failed for ${p.handle}: ${e?.message ?? e}`)
      continue
    }
    for (const w of variantWrites) {
      try {
        await productModule.updateProductVariants(w.id, { metadata: w.metadata })
        variantsUpdated++
      } catch (e: any) {
        logger.warn(`    variant update failed (${w.id}): ${e?.message ?? e}`)
      }
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Our products:        ${products.length}`)
  logger.info(`Resolved on RAMO:    ${parsedByStyle.size}`)
  logger.info(`Unresolved:          ${stylesNeeded.size}`)
  logger.info(`Products updated:    ${productsUpdated}${apply ? "" : " (dry run — no writes)"}`)
  logger.info(`Variants updated:    ${variantsUpdated}${apply ? "" : " (dry run)"}`)
  logger.info(`Images added:        ${imagesAddedTotal}${apply ? "" : " (dry run)"}`)
  if (unmatchedReport.length) {
    logger.info(`Colours with no RAMO image (${unmatchedReport.length} products):`)
    for (const line of unmatchedReport.slice(0, 50)) logger.info(`  • ${line}`)
    if (unmatchedReport.length > 50) logger.info(`  …and ${unmatchedReport.length - 50} more`)
  }
}
