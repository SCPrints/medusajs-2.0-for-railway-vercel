/**
 * Remove "phantom" colour variants from Gildan-family products — colours that
 * the data file (xlsx) created but for which NO image of that colour exists
 * anywhere: not on the supplier page (alias-aware scrape), not already on the
 * variant's `garment_images`, and not in the product gallery.
 *
 * Why this exists: American Apparel's xlsx colour range and gildanbrands.com.au's
 * photographed range disagree. AA 1301, for example, lists "Orange" and "White"
 * as colours but the AU site carries no swatch/photo for them — so the storefront
 * renders a solid swatch that, when picked, shows the wrong (default) garment.
 * A colour we can never illustrate is worse than no colour: this prunes them so
 * customers aren't offered an unphotographable variant.
 *
 * NOT touched: colours that resolve to a real image. Navy ("True Navy") and
 * Royal Blue ("Royal") resolve through the colour-name ALIAS bridge
 * (`gildanColourKeyCandidates`), so they are KEPT — run `repair-gildan-images`
 * first so those images are present, then this script.
 *
 * Conservative by design — a colour is only treated as phantom when ALL THREE
 * sources come up empty, and a product is NEVER emptied (if every colour would
 * be removed, the product is skipped + logged for manual review). Variant
 * deletion is soft (Medusa default), so historical orders keep their snapshots.
 *
 * Run locally (dry run — defaults to American Apparel only):
 *   pnpm --filter backend exec medusa exec src/scripts/hide-imageless-gildan-colours.ts
 * Apply:
 *   pnpm --filter backend exec medusa exec src/scripts/hide-imageless-gildan-colours.ts -- --apply
 * One product:
 *   GILDAN_HIDE_HANDLES=american-apparel-1301 pnpm --filter backend exec medusa exec src/scripts/hide-imageless-gildan-colours.ts
 *
 * Production (Fly):
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/hide-imageless-gildan-colours.js -- --apply
 *
 * Flags / env:
 *   --apply      | GILDAN_HIDE_APPLY=1       persist deletions (otherwise dry run)
 *   --all-gildan | GILDAN_HIDE_ALL_GILDAN=1  every gildan-source product (not just AA)
 *   --handles=…  | GILDAN_HIDE_HANDLES=…      restrict to specific handles
 *   --no-cache   | GILDAN_HIDE_NO_CACHE=1     ignore the on-disk scrape cache
 *
 * After applying, purge the storefront product cache (HARD RULE 6):
 *   POST {storefront}/api/revalidate-products  Authorization: Bearer $REVALIDATE_SECRET
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  deleteProductVariantsWorkflow,
  updateProductOptionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { GildanImageScraper } from "../modules/gildan/image-scraper"
import { GildanSitemapResolver } from "../modules/gildan/sitemap-resolver"
import { buildGildanGarmentImages } from "../modules/gildan/mapping"
import type { GildanColour } from "../modules/gildan/types"

const COLOUR_OPTION_RE = /colou?r/i

const flagOn = (
  args: string[] | undefined,
  flag: string,
  ...envs: string[]
): boolean =>
  (args ?? []).includes(flag) ||
  envs.some((e) => process.env[e] === "1" || process.env[e] === "true")

type HideOption = {
  id: string
  title: string | null
  values?: Array<{ value: string | null }>
}
type HideVariant = {
  id: string
  options?: Array<{ value: string | null; option: { title: string } | null }>
  metadata?: Record<string, unknown> | null
}
type HideProduct = {
  id: string
  handle: string
  images: Array<{ url: string | null }>
  metadata: Record<string, unknown> | null
  options: HideOption[]
  variants: HideVariant[]
}

const colourOfVariant = (v: HideVariant): string | null => {
  for (const o of v.options ?? []) {
    if (o.option && COLOUR_OPTION_RE.test(o.option.title ?? "")) {
      const val = (o.value ?? "").trim()
      if (val) return val
    }
  }
  return null
}

const styleParentOf = (p: HideProduct): string | null => {
  const g = (p.metadata?.gildan ?? {}) as Record<string, unknown>
  const fromMeta = typeof g.style_parent === "string" ? g.style_parent.trim() : ""
  if (fromMeta) return fromMeta
  const m = p.handle.match(/^[a-z-]*?-([a-z0-9]+)$/i)
  return m ? m[1]!.toUpperCase() : null
}

const brandOf = (p: HideProduct): string => {
  const g = (p.metadata?.gildan ?? {}) as Record<string, unknown>
  return typeof g.brand === "string" && g.brand.trim() ? g.brand.trim() : "Gildan"
}

const productUrlOf = (p: HideProduct): string | null => {
  const g = (p.metadata?.gildan ?? {}) as Record<string, unknown>
  return typeof g.product_url === "string" && g.product_url.trim()
    ? g.product_url.trim()
    : null
}

/** Minimal GildanColour so `buildGildanGarmentImages` falls straight through
 *  its filename path (no filenames) to the alias-aware colour map. */
const colourShell = (name: string): GildanColour => ({
  name,
  hex: null,
  images: { hero: null, views: [] },
  sizes: [],
})

/** Significant lowercase tokens of a colour label for a permissive "is this
 *  colour pictured anywhere in the gallery?" check. Deliberately BROAD — a
 *  match only ever KEEPS a colour (marks it non-phantom), so erring toward
 *  matches errs toward never over-deleting. Words <3 chars are dropped to
 *  avoid spurious substring hits. */
const colourKeepNeedles = (label: string): string[] => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (!slug) return []
  const compact = slug.replace(/\s+/g, "")
  const words = slug.split(/\s+/).filter((w) => w.length >= 3)
  return Array.from(new Set([compact, ...words].filter((n) => n.length >= 3)))
}

const galleryHasColour = (p: HideProduct, label: string): boolean => {
  const needles = colourKeepNeedles(label)
  if (!needles.length) return false
  for (const img of p.images ?? []) {
    const file = (img.url ?? "").split("/").pop()?.split("?")[0]?.toLowerCase()
    if (!file) continue
    const compactFile = file.replace(/[^a-z0-9]+/g, "")
    if (needles.some((n) => compactFile.includes(n))) return true
  }
  return false
}

const variantHasOwnImage = (v: HideVariant): boolean => {
  const gi = ((v.metadata ?? {}) as Record<string, unknown>).garment_images
  if (!gi) return false
  let obj: Record<string, unknown> | null = null
  if (typeof gi === "string") {
    try {
      obj = JSON.parse(gi)
    } catch {
      return false
    }
  } else if (typeof gi === "object") {
    obj = gi as Record<string, unknown>
  }
  if (!obj) return false
  const front = typeof obj.front === "string" ? obj.front.trim() : ""
  const all = Array.isArray(obj.all) ? obj.all.filter(Boolean) : []
  return front.length > 0 || all.length > 0
}

export default async function hideImagelessGildanColours({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  const apply = flagOn(args, "--apply", "GILDAN_HIDE_APPLY")
  const allGildan = flagOn(args, "--all-gildan", "GILDAN_HIDE_ALL_GILDAN")
  const noCache = flagOn(args, "--no-cache", "GILDAN_HIDE_NO_CACHE")
  const handlesArg = (args ?? []).find((a) => a.startsWith("--handles="))
  const handlesRaw =
    (handlesArg ? handlesArg.split("=")[1] : undefined) ||
    process.env.GILDAN_HIDE_HANDLES ||
    ""
  const handleFilter = handlesRaw
    ? handlesRaw.split(",").map((h) => h.trim()).filter(Boolean)
    : null

  logger.info(
    `Gildan phantom-colour hide — ${apply ? "APPLY" : "DRY RUN"}${
      noCache ? " (no-cache)" : ""
    } — scope: ${
      handleFilter ? handleFilter.join(",") : allGildan ? "all gildan" : "American Apparel"
    }`
  )

  const fields = [
    "id",
    "handle",
    "images.url",
    "metadata",
    "options.id",
    "options.title",
    "options.values.value",
    "variants.id",
    "variants.metadata",
    "variants.options.value",
    "variants.options.option.title",
  ]

  let products: HideProduct[]
  if (handleFilter) {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { handle: handleFilter },
      pagination: { take: 5000 },
    })
    products = (data ?? []) as HideProduct[]
  } else {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { metadata: { source: "gildan" } } as any,
      pagination: { take: 5000 },
    })
    products = ((data ?? []) as HideProduct[]).filter(
      (p) => allGildan || brandOf(p).toLowerCase() === "american apparel"
    )
  }
  logger.info(`Loaded ${products.length} product(s) to inspect.`)

  const sitemapResolver = new GildanSitemapResolver({
    logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
  })
  const scraper = new GildanImageScraper({
    logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
    sitemapResolver,
    noCache,
  })

  let productsChanged = 0
  let variantsRemoved = 0
  let coloursRemovedTotal = 0
  const skippedWouldEmpty: string[] = []
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
      // Couldn't reach/parse the page — do NOT delete on uncertainty.
      unresolved.push(`${p.handle} (${styleParent})`)
      continue
    }

    // Distinct colours on the product (preserve first-seen order).
    const coloursSeen: string[] = []
    const variantsByColour = new Map<string, HideVariant[]>()
    for (const v of p.variants) {
      const colour = colourOfVariant(v)
      if (!colour) continue
      const key = colour.toLowerCase()
      if (!variantsByColour.has(key)) {
        variantsByColour.set(key, [])
        coloursSeen.push(colour)
      }
      variantsByColour.get(key)!.push(v)
    }

    const phantomColours: string[] = []
    for (const colour of coloursSeen) {
      const variants = variantsByColour.get(colour.toLowerCase())!
      const resolved = buildGildanGarmentImages(
        colourShell(colour),
        urlByFilename,
        urlByColour
      )
      const supplierHasImage = resolved.all.length > 0
      const ownImage = variants.some(variantHasOwnImage)
      const gallery = galleryHasColour(p, colour)
      if (!supplierHasImage && !ownImage && !gallery) {
        phantomColours.push(colour)
      }
    }

    if (phantomColours.length === 0) continue

    // Never empty a product. If every colour is phantom, something is wrong
    // (likely the page didn't resolve) — skip + flag for manual review.
    if (phantomColours.length >= coloursSeen.length) {
      skippedWouldEmpty.push(
        `${p.handle} (all ${coloursSeen.length} colours unmatched: ${phantomColours.join(", ")})`
      )
      logger.warn(
        `  ${p.handle}: ALL ${coloursSeen.length} colours unmatched — skipping (manual review)`
      )
      continue
    }

    const variantIds = phantomColours.flatMap((c) =>
      variantsByColour.get(c.toLowerCase())!.map((v) => v.id)
    )
    const colourOption = p.options.find((o) => COLOUR_OPTION_RE.test(o.title ?? ""))
    const remainingValues = colourOption
      ? (colourOption.values ?? [])
          .map((v) => (v.value ?? "").trim())
          .filter(Boolean)
          .filter(
            (val) =>
              !phantomColours.some(
                (c) => c.toLowerCase() === val.toLowerCase()
              )
          )
      : []

    logger.info(
      `  ${p.handle} (${styleParent}): remove ${phantomColours.length} colour(s) [${phantomColours.join(
        ", "
      )}] → ${variantIds.length} variant(s); ${remainingValues.length} colours remain`
    )

    if (!apply) continue

    try {
      await deleteProductVariantsWorkflow(container).run({
        input: { ids: variantIds },
      })
      variantsRemoved += variantIds.length
      // Prune the now-orphaned colour option values so the swatch disappears.
      if (colourOption && remainingValues.length) {
        await updateProductOptionsWorkflow(container).run({
          input: {
            selector: { id: colourOption.id },
            update: { values: remainingValues },
          },
        })
      }
      coloursRemovedTotal += phantomColours.length
      productsChanged++
    } catch (e: any) {
      logger.warn(`    failed for ${p.handle}: ${e?.message ?? e}`)
    }
  }

  logger.info("=== Summary ===")
  logger.info(`Products inspected:        ${products.length}`)
  logger.info(
    `Products changed:          ${productsChanged}${apply ? "" : " (dry run — no writes)"}`
  )
  logger.info(`Colours removed:           ${coloursRemovedTotal}${apply ? "" : " (dry run)"}`)
  logger.info(`Variants removed:          ${variantsRemoved}${apply ? "" : " (dry run)"}`)
  if (skippedWouldEmpty.length) {
    logger.warn(
      `Skipped (would empty product): ${skippedWouldEmpty.length}\n  - ${skippedWouldEmpty.join(
        "\n  - "
      )}`
    )
  }
  if (unresolved.length) {
    logger.warn(`Unresolved (page unreachable, untouched): ${unresolved.join(", ")}`)
  }
  if (apply) {
    logger.info(
      "Done. Purge the storefront cache: POST {storefront}/api/revalidate-products (Bearer REVALIDATE_SECRET, body {\"tags\":[\"products\"]})."
    )
  }
}
