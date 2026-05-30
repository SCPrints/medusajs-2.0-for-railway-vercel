/**
 * Repair per-colour images on already-imported Gildan products by re-reading
 * each style's gildanbrands.com.au page and resolving images via the page's
 * `data-color-name` swatch labels (`extractColorImageMapFromGildanHtml`).
 *
 * Why this exists: Gildan's YOUTH styles (SF500B, 65000B, 64000B, …) name
 * their website images by colour CODE (`SF500B_426_A1`, `65000B_533C_032_…
 * _SD_F_…`) rather than colour NAME, so the importer's filename-matching
 * path resolved nothing for them — every colour but White (which also ships
 * a legacy name-based `_White_01` file) ended up imageless. The scraper now
 * also builds a colour-name → image map from the page's swatch labels; this
 * script applies that map to the EXISTING products without needing the
 * source xlsx (it reads each variant's colour straight off the product).
 *
 * What it writes per product (only when it actually improves the product):
 *   - `product.images[]`        — every resolved colour's front/back/detail,
 *                                 merged with existing images (dedup by URL).
 *   - `product.thumbnail`       — first resolved image (a front) if currently
 *                                 missing or replaced by the merged set's lead.
 *   - `variant.metadata.garment_images = { front, back?, model_image?, all }`
 *                                 per colour — the storefront PDP gallery +
 *                                 swatch + customizer mockup primary path.
 *   - `product.metadata.gildan_image_repair_at` — ISO stamp.
 *
 * Safe by default: a product is only written when the resolved set adds
 * images or gives a variant a front it lacked, so healthy (already-correct
 * adult) products are skipped and re-runs are idempotent. `--force` writes
 * regardless.
 *
 * Run locally (dry run — default targets the two known-broken youth styles):
 *   pnpm --filter backend exec medusa exec src/scripts/repair-gildan-images.ts
 * Apply:
 *   pnpm --filter backend exec medusa exec src/scripts/repair-gildan-images.ts -- --apply
 * All Gildan products:
 *   GILDAN_REPAIR_ALL=1 pnpm --filter backend exec medusa exec src/scripts/repair-gildan-images.ts -- --apply
 *
 * Production (Fly):
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/repair-gildan-images.js -- --apply
 *
 * Flags / env:
 *   --apply | GILDAN_REPAIR_APPLY=1   persist changes (otherwise dry run)
 *   --force | GILDAN_REPAIR_FORCE=1   write even when no improvement detected
 *   --all   | GILDAN_REPAIR_ALL=1     scan every metadata.source=gildan product
 *   --handles=gildan-sf500b,…         restrict to specific handles
 *                                     | GILDAN_REPAIR_HANDLES=…
 *   --no-cache | GILDAN_REPAIR_NO_CACHE=1   ignore the on-disk scrape cache
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  GildanImageScraper,
  normalizeImageUrlForDedup,
} from "../modules/gildan/image-scraper"
import { GildanSitemapResolver } from "../modules/gildan/sitemap-resolver"
import { buildGildanGarmentImages } from "../modules/gildan/mapping"
import type { GildanColour } from "../modules/gildan/types"

/** Default targets when neither --all nor --handles is given. */
const DEFAULT_HANDLES = ["gildan-sf500b", "gildan-65000b"]

const COLOUR_OPTION_RE = /colou?r/i

type RepairVariant = {
  id: string
  options?: Array<{ value: string | null; option: { title: string } | null }>
  metadata?: Record<string, unknown> | null
}
type RepairProduct = {
  id: string
  handle: string
  thumbnail: string | null
  images: Array<{ url: string }>
  metadata: Record<string, unknown> | null
  variants: RepairVariant[]
}

const flagOn = (
  args: string[] | undefined,
  flag: string,
  ...envs: string[]
): boolean =>
  (args ?? []).includes(flag) ||
  envs.some((e) => process.env[e] === "1" || process.env[e] === "true")

const colourOfVariant = (v: RepairVariant): string | null => {
  for (const o of v.options ?? []) {
    if (o.option && COLOUR_OPTION_RE.test(o.option.title ?? "")) {
      const val = (o.value ?? "").trim()
      if (val) return val
    }
  }
  return null
}

/** styleParent from product metadata, falling back to the handle suffix. */
const styleParentOf = (p: RepairProduct): string | null => {
  const g = (p.metadata?.gildan ?? {}) as Record<string, unknown>
  const fromMeta = typeof g.style_parent === "string" ? g.style_parent.trim() : ""
  if (fromMeta) return fromMeta
  const m = p.handle.match(/^[a-z-]*?-([a-z0-9]+)$/i)
  return m ? m[1]!.toUpperCase() : null
}

const brandOf = (p: RepairProduct): string => {
  const g = (p.metadata?.gildan ?? {}) as Record<string, unknown>
  return typeof g.brand === "string" && g.brand.trim() ? g.brand.trim() : "Gildan"
}

const productUrlOf = (p: RepairProduct): string | null => {
  const g = (p.metadata?.gildan ?? {}) as Record<string, unknown>
  return typeof g.product_url === "string" && g.product_url.trim()
    ? g.product_url.trim()
    : null
}

/** Construct the minimal GildanColour so `buildGildanGarmentImages` falls
 *  straight through its filename path (no filenames) to the colour map. */
const colourShell = (name: string): GildanColour => ({
  name,
  hex: null,
  images: { hero: null, views: [] },
  sizes: [],
})

export default async function repairGildanImages({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const productModule = container.resolve(Modules.PRODUCT) as any

  const apply = flagOn(args, "--apply", "GILDAN_REPAIR_APPLY")
  const force = flagOn(args, "--force", "GILDAN_REPAIR_FORCE")
  const all = flagOn(args, "--all", "GILDAN_REPAIR_ALL")
  const noCache = flagOn(args, "--no-cache", "GILDAN_REPAIR_NO_CACHE")
  const handlesArg = (args ?? []).find((a) => a.startsWith("--handles="))
  const handlesRaw =
    (handlesArg ? handlesArg.split("=")[1] : undefined) ||
    process.env.GILDAN_REPAIR_HANDLES ||
    ""
  const handleFilter = handlesRaw
    ? handlesRaw.split(",").map((h) => h.trim()).filter(Boolean)
    : null

  logger.info(
    `Gildan image repair — ${apply ? "APPLY" : "DRY RUN"}${force ? " (force)" : ""}${
      noCache ? " (no-cache)" : ""
    }`
  )

  // ---- load target products --------------------------------------------
  const fields = [
    "id",
    "handle",
    "thumbnail",
    "images.url",
    "metadata",
    "variants.id",
    "variants.metadata",
    "variants.options.value",
    "variants.options.option.title",
  ]
  let products: RepairProduct[]
  if (handleFilter) {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { handle: handleFilter },
      pagination: { take: 5000 },
    })
    products = (data ?? []) as RepairProduct[]
  } else if (all) {
    // metadata.source covers all three Gildan-family handle prefixes
    // (gildan-, american-apparel-, comfort-colors-) in one filter.
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { metadata: { source: "gildan" } } as any,
      pagination: { take: 5000 },
    })
    products = (data ?? []) as RepairProduct[]
  } else {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { handle: DEFAULT_HANDLES },
      pagination: { take: 5000 },
    })
    products = (data ?? []) as RepairProduct[]
    logger.info(
      `No --all/--handles given — defaulting to the two known youth styles: ${DEFAULT_HANDLES.join(", ")}`
    )
  }
  logger.info(`Loaded ${products.length} product(s) to inspect.`)

  // ---- scraper ---------------------------------------------------------
  const sitemapResolver = new GildanSitemapResolver({
    logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
  })
  const scraper = new GildanImageScraper({
    logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
    sitemapResolver,
    noCache,
  })

  let productsUpdated = 0
  let variantsUpdated = 0
  let imagesAddedTotal = 0
  let skippedNoImprovement = 0
  const unresolved: string[] = []

  for (const p of products) {
    const styleParent = styleParentOf(p)
    if (!styleParent) {
      logger.warn(`  ${p.handle}: cannot derive style code — skipping`)
      continue
    }

    const { urlByFilename, urlByColour } = await scraper.resolveImageUrls({
      brand: brandOf(p),
      styleParent,
      productUrl: productUrlOf(p),
      filenames: [],
    })

    if (urlByColour.size === 0 && urlByFilename.size === 0) {
      unresolved.push(`${p.handle} (${styleParent})`)
      continue
    }

    // Per-variant garment images (colour fallback resolves youth styles).
    const variantWrites: Array<{
      id: string
      metadata: Record<string, unknown>
      gainedFront: boolean
    }> = []
    const orderedColourImages: string[] = []
    const seenColours = new Set<string>()
    let coloursMatched = 0
    const coloursUnmatched: string[] = []

    for (const v of p.variants) {
      const colour = colourOfVariant(v)
      if (!colour) continue
      const garment = buildGildanGarmentImages(
        colourShell(colour),
        urlByFilename,
        urlByColour
      )
      if (!garment.all.length) {
        if (!coloursUnmatched.includes(colour)) coloursUnmatched.push(colour)
        continue
      }
      coloursMatched++
      // collect product-gallery images once per colour (front-first order)
      if (!seenColours.has(colour.toLowerCase())) {
        seenColours.add(colour.toLowerCase())
        for (const u of garment.all) orderedColourImages.push(u)
      }
      const prevMeta = (v.metadata ?? {}) as Record<string, unknown>
      const prevGarment = (prevMeta.garment_images ?? {}) as Record<string, unknown>
      const hadFront =
        typeof prevGarment.front === "string" && prevGarment.front.length > 0
      variantWrites.push({
        id: v.id,
        metadata: { ...prevMeta, garment_images: garment },
        gainedFront: !hadFront,
      })
    }

    // merge product images: resolved colour images first (authoritative,
    // front-first), then any existing extras not already present.
    const existingUrls = (p.images ?? []).map((i) => i.url).filter(Boolean)
    const seen = new Set<string>()
    const mergedImages: string[] = []
    for (const url of [...orderedColourImages, ...existingUrls]) {
      const key = normalizeImageUrlForDedup(url)
      if (!key || seen.has(key)) continue
      seen.add(key)
      mergedImages.push(url)
    }
    const addedCount = Math.max(0, mergedImages.length - existingUrls.length)
    const anyGainedFront = variantWrites.some((w) => w.gainedFront)
    const improved = addedCount > 0 || anyGainedFront

    logger.info(
      `  ${p.handle} (${styleParent}): ${coloursMatched} colours matched, +${addedCount} images, ${variantWrites.length} variant writes${
        coloursUnmatched.length ? `, unmatched: ${coloursUnmatched.join(", ")}` : ""
      }`
    )

    if (!improved && !force) {
      skippedNoImprovement++
      continue
    }
    if (!apply) continue

    try {
      await productModule.updateProducts(p.id, {
        images: mergedImages.map((url) => ({ url })),
        thumbnail: mergedImages[0] || p.thumbnail || undefined,
        metadata: {
          ...(p.metadata ?? {}),
          gildan_image_repair_at: new Date().toISOString(),
        },
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
  logger.info(`Products inspected:      ${products.length}`)
  logger.info(`Products updated:        ${productsUpdated}${apply ? "" : " (dry run — no writes)"}`)
  logger.info(`Variants updated:        ${variantsUpdated}${apply ? "" : " (dry run)"}`)
  logger.info(`Images added:            ${imagesAddedTotal}${apply ? "" : " (dry run)"}`)
  logger.info(`Skipped (no improvement):${skippedNoImprovement}`)
  if (unresolved.length) {
    logger.warn(`Unresolved (no page images): ${unresolved.join(", ")}`)
  }
}
