/**
 * Fill per-colour image GAPS on AS Colour products by scraping the AS Colour
 * public website (ascolour.com), which carries live colour photos that the
 * authenticated catalog API 404s on (e.g. 5080 Heavy Tee: Walnut + Pistachio).
 *
 * IMPORTANT — this script is APPEND-ONLY and HEAD-VALIDATED. It NEVER removes
 * or overwrites an existing image. For each product it:
 *   1. Works out which colour variants currently have NO image (by colour token
 *      in the existing image filenames).
 *   2. Resolves the product's website URL from ascolour.com's sitemap
 *      (styleCode = trailing token of the URL slug).
 *   3. Scrapes that page's BigCommerce CDN image URLs, normalises them to a
 *      single width, and keeps only those whose filename matches a MISSING
 *      colour.
 *   4. HEAD-checks each candidate (reuses image-audit checkImageUrl) and APPENDS
 *      only the ones that actually return 200.
 * Worst case it adds nothing. It cannot break a product.
 *
 * Usage:
 *   # Local
 *   cd backend && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/scrape-ascolour-website-images.ts
 *   cd backend && npx medusa exec src/scripts/scrape-ascolour-website-images.ts
 *   # Prod (Fly)
 *   cd /app/.medusa/server && IMPORT_DRY_RUN=1 npx medusa exec src/scripts/scrape-ascolour-website-images.js
 *   cd /app/.medusa/server && npx medusa exec src/scripts/scrape-ascolour-website-images.js
 *
 * Env vars:
 *   IMPORT_DRY_RUN=1      — report only, write nothing.
 *   IMPORT_LIMIT=N        — process at most N AS Colour products with gaps.
 *   ONLY_STYLES=5080,4080 — restrict to these styleCodes.
 *   SCRAPE_WIDTH=1500     — BigCommerce stencil width to request (default 1500).
 *   CHECK_TIMEOUT_MS=12000
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { checkImageUrl } from "../services/image-audit/check"

const PAGE_SIZE = 100
const SITEMAP_BASE = "https://ascolour.com/xmlsitemap.php?type=products&page="
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
const CDN_RE = /https:\/\/cdn11\.bigcommerce\.com\/[^"'\s)]+?\.(?:jpg|jpeg|png)/gi

const colourToken = (c: string): string => c.trim().toUpperCase().replace(/[\s/-]+/g, "_")

const fileNameUpper = (url: string): string => {
  try {
    return (new URL(url).pathname.split("/").pop() ?? "").toUpperCase()
  } catch {
    return url.toUpperCase()
  }
}

// The two colour-specific views we want for every colour. AS Colour filenames
// are `<style>_<NAME>_<COLOUR>__<hash>` (front) and `..._<COLOUR>_BACK__<hash>`.
const VIEWS = ["front", "back"] as const
type View = (typeof VIEWS)[number]

// Which view (if any) a filename represents for a given colour token.
const viewOf = (fileUpper: string, token: string): View | null => {
  if (fileUpper.includes(`_${token}_BACK`)) return "back"
  if (fileUpper.includes(`_${token}__`)) return "front"
  return null
}

const dedupeKey = (url: string): string => fileNameUpper(url).replace(/\.[A-Z]+$/, "")

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return await r.text()
}

// styleCode (UPPER) -> website product URL, built from the sitemap.
async function buildStyleUrlMap(logger: any): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (let page = 1; page <= 20; page++) {
    let xml: string
    try {
      xml = await fetchText(`${SITEMAP_BASE}${page}`)
    } catch (err: any) {
      logger.warn(`  sitemap page ${page} fetch failed: ${err?.message ?? err}`)
      break
    }
    const locs = (xml.match(/<loc>[^<]+<\/loc>/g) ?? []).map((l) =>
      l.replace(/<\/?loc>/g, "").trim()
    )
    if (!locs.length) break
    for (const url of locs) {
      const slug = url.replace(/\/+$/, "").split("/").pop() ?? ""
      const code = slug.split("-").pop()?.toUpperCase() ?? ""
      if (/^[0-9]+[A-Z]?$/.test(code) && !map.has(code)) map.set(code, url)
    }
    if (locs.length < 100) break // last page
  }
  return map
}

export default async function scrapeAsColourWebsiteImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as unknown as {
    updateProducts?: (
      id: string,
      data: { images?: Array<{ url: string }> }
    ) => Promise<unknown>
  }
  if (typeof productModule.updateProducts !== "function") {
    throw new Error("Product module updateProducts is unavailable")
  }

  const dryRun =
    process.env.IMPORT_DRY_RUN === "1" || process.env.IMPORT_DRY_RUN === "true"
  const limit = process.env.IMPORT_LIMIT ? Number.parseInt(process.env.IMPORT_LIMIT, 10) : undefined
  const onlyStyles = new Set(
    (process.env.ONLY_STYLES ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
  )
  const width = process.env.SCRAPE_WIDTH ? Number.parseInt(process.env.SCRAPE_WIDTH, 10) : 1500
  const timeoutMs = process.env.CHECK_TIMEOUT_MS ? Number.parseInt(process.env.CHECK_TIMEOUT_MS, 10) : 12000

  logger.info(
    `scrape-ascolour-website-images: dryRun=${dryRun}, limit=${limit ?? "all"}, onlyStyles=${onlyStyles.size ? [...onlyStyles].join(",") : "all"}, width=${width}w`
  )

  logger.info("Building styleCode → website-URL map from ascolour.com sitemap…")
  const urlMap = await buildStyleUrlMap(logger)
  logger.info(`  ${urlMap.size} product URLs resolved from sitemap.`)

  let offset = 0
  let scanned = 0
  let withGaps = 0
  let filled = 0
  let noUrl = 0
  let stillMissing = 0
  let stopped = false

  while (!stopped) {
    const { data: page } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "metadata", "images.url", "variants.metadata"],
      pagination: { take: PAGE_SIZE, skip: offset },
    })
    if (!page?.length) break
    offset += page.length

    for (const product of page as any[]) {
      const meta = (product.metadata ?? {}) as Record<string, any>
      const isAscolour = meta.source === "ascolour" || meta.ascolour?.styleCode
      if (!isAscolour) continue

      let styleCode: string | undefined = meta.ascolour?.styleCode
      const colours = new Set<string>()
      for (const v of product.variants ?? []) {
        const vmeta = (v.metadata ?? {}) as Record<string, any>
        if (!styleCode && vmeta.ascolour?.styleCode) styleCode = vmeta.ascolour.styleCode
        if (vmeta.ascolour?.colour) colours.add(vmeta.ascolour.colour)
      }
      if (!styleCode || !colours.size) continue
      const styleUpper = styleCode.toUpperCase()
      if (onlyStyles.size && !onlyStyles.has(styleUpper)) continue

      const currentUrls: string[] = (product.images ?? []).map((i: any) => i.url).filter(Boolean)
      const currentTokens = currentUrls.map(fileNameUpper)

      // Which (colour, view) pairs is the product MISSING? A colour needs both a
      // front and a back; having only one (e.g. Navy front, no back) is a gap.
      const needs: Array<{ colour: string; token: string; view: View }> = []
      for (const colour of colours) {
        const t = colourToken(colour)
        if (!t) continue
        for (const view of VIEWS) {
          const has = currentTokens.some((f) => viewOf(f, t) === view)
          if (!has) needs.push({ colour, token: t, view })
        }
      }
      if (!needs.length) continue

      scanned++
      if (limit && scanned > limit) { stopped = true; break }
      withGaps++
      const needLabel = needs.map((n) => `${n.colour} ${n.view}`).join(", ")

      const pageUrl = urlMap.get(styleUpper)
      if (!pageUrl) {
        logger.warn(`  ${product.handle} (${styleCode}): missing [${needLabel}] but no website URL in sitemap — skip`)
        noUrl++
        continue
      }

      let html: string
      try {
        html = await fetchText(pageUrl)
      } catch (err: any) {
        logger.warn(`  ${product.handle} (${styleCode}): website fetch failed (${pageUrl}) — ${err?.message ?? err}`)
        noUrl++
        continue
      }

      // Extract CDN urls, normalise width, dedupe by filename.
      const rawUrls = Array.from(new Set(html.match(CDN_RE) ?? []))
      const byFile = new Map<string, string>()
      for (const u of rawUrls) {
        const normalised = u.replace(/\/stencil\/\d+w\//, `/stencil/${width}w/`)
        const key = dedupeKey(normalised)
        if (!byFile.has(key)) byFile.set(key, normalised)
      }

      const existingKeys = new Set(currentUrls.map(dedupeKey))
      const additions: string[] = []
      const filledLabels: string[] = []
      const stillGapLabels: string[] = []

      for (const need of needs) {
        // A website image for exactly this colour + view.
        const candidates = [...byFile.values()].filter(
          (u) => viewOf(fileNameUpper(u), need.token) === need.view
        )
        let got = false
        for (const cand of candidates) {
          if (existingKeys.has(dedupeKey(cand))) { got = true; break }
          const res = await checkImageUrl(cand, timeoutMs)
          if (!res.ok) continue
          additions.push(cand)
          existingKeys.add(dedupeKey(cand))
          got = true
          break
        }
        if (got) filledLabels.push(`${need.colour} ${need.view}`)
        else { stillGapLabels.push(`${need.colour} ${need.view}`); stillMissing++ }
      }

      if (!additions.length) {
        logger.warn(`  ${product.handle} (${styleCode}): missing [${needLabel}] — found nothing live on website to add`)
        continue
      }

      filled++
      logger.info(
        `  ${product.handle} (${styleCode}): +${additions.length} image(s) [${filledLabels.join(", ")}]${stillGapLabels.length ? ` (still missing: ${stillGapLabels.join(", ")})` : ""}`
      )

      if (dryRun) continue
      try {
        // APPEND ONLY — keep every existing image, add the validated new ones.
        const finalImages = [...currentUrls, ...additions].map((url) => ({ url }))
        await productModule.updateProducts!(product.id, { images: finalImages })
      } catch (err: any) {
        logger.warn(`  ${product.handle} (${styleCode}): updateProducts failed — ${err?.message ?? err}`)
        filled--
      }
    }
    if (page.length < PAGE_SIZE) break
  }

  logger.info("---")
  logger.info(
    `Done. products-with-gaps=${withGaps}, ${dryRun ? "would fill" : "filled"}=${filled}, no-website-url=${noUrl}, colours-still-without-photo=${stillMissing}.`
  )
}
