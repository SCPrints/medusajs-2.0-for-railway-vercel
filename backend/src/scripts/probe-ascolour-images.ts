/**
 * READ-ONLY probe: for AS Colour products, compare the image set the AS Colour
 * API returns *now* against what's stored in our DB, and report whether the API
 * actually carries a photo for every colour variant.
 *
 * This decides the image-refresh strategy:
 *   - If the API returns a photo for (almost) every colour → an API-based
 *     refresh (un-archive upgrade-ascolour-images-to-zoom.ts) fixes the catalog.
 *   - If the API returns the same short set we already have → the missing
 *     colours only live on the public website and we must scrape it instead.
 *
 * Writes NOTHING. Safe to run on prod.
 *
 * Usage:
 *   # Local
 *   cd backend && npx medusa exec src/scripts/probe-ascolour-images.ts
 *   # Prod (Fly)
 *   cd /app/.medusa/server && npx medusa exec src/scripts/probe-ascolour-images.js
 *
 * Env vars:
 *   PROBE_STYLES=5080,4001   — probe exactly these styleCodes (comma-separated).
 *                              Default: style 5080 (the reported Heavy Tee) plus
 *                              a random sample of AS Colour products.
 *   PROBE_SAMPLE=N           — how many extra AS Colour products to sample when
 *                              PROBE_STYLES is unset (default 12).
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import { AsColourImage } from "../modules/ascolour/types"

const PAGE_SIZE = 100

const extractArray = <T,>(resp: any): T[] => {
  if (!resp) return []
  if (Array.isArray(resp)) return resp as T[]
  return resp.items ?? resp.data ?? resp.results ?? []
}

const pickUrl = (img: any): string | undefined =>
  img.urlZoom || img.urlStandard || img.urlThumbnail || img.urlTiny

// Last path segment of a URL, uppercased — what the storefront matches colour
// names against (e.g. ".../5080_HEAVY_TEE_RED__08789.jpg" → "5080_HEAVY_TEE_RED__08789.JPG").
const fileTokenOf = (url: string): string => {
  try {
    const path = new URL(url).pathname
    return (path.split("/").pop() ?? path).toUpperCase()
  } catch {
    return url.toUpperCase()
  }
}

// Does any image filename contain this colour token? Mirrors the storefront's
// filename-contains-colour matching (normalises spaces/dashes to underscores).
const colourToken = (colour: string): string =>
  colour.trim().toUpperCase().replace(/[\s/-]+/g, "_")

const colourHasImage = (colour: string, fileTokens: string[]): boolean => {
  const needle = colourToken(colour)
  if (!needle) return false
  const compact = needle.replace(/_/g, "")
  return fileTokens.some((t) => {
    const tCompact = t.replace(/[^A-Z0-9]/g, "")
    return t.includes(needle) || tCompact.includes(compact)
  })
}

export default async function probeAsColourImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ascolour = container.resolve(ASCOLOUR_MODULE) as AsColourService

  const explicitStyles = (process.env.PROBE_STYLES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const sampleSize = process.env.PROBE_SAMPLE
    ? Number.parseInt(process.env.PROBE_SAMPLE, 10)
    : 12

  // ---- Collect candidate AS Colour products from the DB ----
  type Candidate = {
    handle: string
    styleCode: string
    dbImageCount: number
    dbFileTokens: string[]
    colours: string[]
  }

  const candidates: Candidate[] = []
  let offset = 0
  while (true) {
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
      if (!styleCode) continue

      const dbUrls: string[] = (product.images ?? [])
        .map((i: any) => i.url as string)
        .filter(Boolean)

      candidates.push({
        handle: product.handle,
        styleCode,
        dbImageCount: dbUrls.length,
        dbFileTokens: dbUrls.map(fileTokenOf),
        colours: Array.from(colours),
      })
    }
    if (page.length < PAGE_SIZE) break
  }

  logger.info(`Found ${candidates.length} AS Colour product(s) in the DB.`)

  // ---- Decide which to probe ----
  let targets: Candidate[]
  if (explicitStyles.length) {
    targets = candidates.filter((c) => explicitStyles.includes(c.styleCode))
    const found = new Set(targets.map((c) => c.styleCode))
    for (const s of explicitStyles) {
      if (!found.has(s)) logger.warn(`  PROBE_STYLES included ${s} but no DB product matched it.`)
    }
  } else {
    const byStyle = new Map(candidates.map((c) => [c.styleCode, c]))
    targets = []
    const heavyTee = byStyle.get("5080")
    if (heavyTee) targets.push(heavyTee)
    // Deterministic spread (no Math.random in medusa exec): every Nth product.
    const rest = candidates.filter((c) => c.styleCode !== "5080")
    const step = Math.max(1, Math.floor(rest.length / Math.max(1, sampleSize)))
    for (let i = 0; i < rest.length && targets.length < sampleSize + 1; i += step) {
      targets.push(rest[i])
    }
  }

  logger.info(`Probing ${targets.length} style(s) against the live AS Colour API…`)
  logger.info("---")

  let stylesApiHasMore = 0
  let stylesApiFullColourCover = 0
  let stylesApiFailed = 0
  let stylesApiSameOrFewer = 0

  for (const c of targets) {
    let apiImages: AsColourImage[]
    try {
      apiImages = extractArray<AsColourImage>(
        await ascolour.getClient().getProductImages(c.styleCode)
      )
    } catch (err: any) {
      logger.warn(`  ${c.handle} (${c.styleCode}): API fetch FAILED — ${err?.message ?? err}`)
      stylesApiFailed++
      continue
    }

    const apiUrls = Array.from(
      new Set(apiImages.map(pickUrl).filter((u): u is string => Boolean(u)))
    )
    const apiTokens = apiUrls.map(fileTokenOf)

    const coloursMissingInDb = c.colours.filter((col) => !colourHasImage(col, c.dbFileTokens))
    const coloursMissingInApi = c.colours.filter((col) => !colourHasImage(col, apiTokens))
    const apiWouldAdd = coloursMissingInDb.filter((col) => colourHasImage(col, apiTokens))

    if (apiUrls.length > c.dbImageCount) stylesApiHasMore++
    else stylesApiSameOrFewer++
    if (coloursMissingInApi.length === 0) stylesApiFullColourCover++

    logger.info(`  ${c.handle} (${c.styleCode})`)
    logger.info(`     colours: ${c.colours.length}  |  DB images: ${c.dbImageCount}  |  API images: ${apiUrls.length}`)
    logger.info(`     colours with NO photo in DB  (broken today): ${coloursMissingInDb.length ? coloursMissingInDb.join(", ") : "none"}`)
    logger.info(`     colours with NO photo in API (refresh can't fix): ${coloursMissingInApi.length ? coloursMissingInApi.join(", ") : "none"}`)
    logger.info(`     → API refresh WOULD newly cover: ${apiWouldAdd.length ? apiWouldAdd.join(", ") : "nothing"}`)
    // First few API filenames so we can eyeball the colour tokens.
    logger.info(`     API filenames: ${apiTokens.slice(0, 16).join("  ") || "(none)"}`)
    logger.info("")
  }

  logger.info("---")
  logger.info("VERDICT")
  logger.info(`  styles probed:                         ${targets.length}`)
  logger.info(`  API returned MORE images than DB:      ${stylesApiHasMore}`)
  logger.info(`  API returned same/fewer images:        ${stylesApiSameOrFewer}`)
  logger.info(`  API covers ALL colour variants:        ${stylesApiFullColourCover}`)
  logger.info(`  API fetch failed:                      ${stylesApiFailed}`)
  logger.info("")
  logger.info("  If most styles show 'API covers ALL colour variants' and 'API returned MORE",
  )
  logger.info("  images than DB', the API has the photos → un-archive + run the image refresh.")
  logger.info("  If the API returns the same short set, the photos are website-only → scrape.")
  logger.info("Done.")
}
