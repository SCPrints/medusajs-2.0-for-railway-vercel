/**
 * One-off repair: fix Thread Lab per-colour images + brand description.
 *
 * WHY: the initial import (import-thread-lab.ts, pre-fix) prepended every
 * "shared" Shopify image (no variant_ids) to EVERY colour, so each colour's
 * `garment_images.front` became the same shared image — wrong swatch + wrong
 * primary picture. ./thread-lab-images.ts now builds colour-specific-first
 * sets; this script re-fetches and rewrites every existing variant's
 * `garment_images` (read-modify-write, preserving bulk_pricing/cost/etc.) and
 * resets each product thumbnail to its first colour's real packshot.
 *
 * Also drops the second sentence from the brand description per request.
 *
 * Idempotent + re-runnable. Preview with DRY_RUN=1.
 *
 * Usage:
 *   pnpm --filter backend medusa exec src/scripts/fix-thread-lab-images.ts
 *   DRY_RUN=1 pnpm --filter backend medusa exec src/scripts/fix-thread-lab-images.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BRAND_MODULE } from "../modules/brand"
import {
  revalidateStorefrontTags,
  tagsForBrand,
  tagsForProduct,
} from "../lib/storefront-revalidate"
import { THREAD_LAB_CATALOG } from "./thread-lab-catalog"
import {
  buildThreadLabGarmentImages,
  fetchThreadLabColourImages,
  type ColourImageSet,
} from "./thread-lab-images"

const BRAND_HANDLE = "thread-lab"
const NEW_DESCRIPTION =
  "Thread Lab is a Melbourne-based premium blank apparel brand built for decoration."

export default async function fixThreadLabImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT) as any
  const brandService = container.resolve(BRAND_MODULE) as any

  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true"

  logger.info(`Thread Lab image repair — dryRun=${dryRun}.`)

  // 1. Brand description — drop the second sentence.
  try {
    const brands = (await brandService.listBrands({})) as Array<{
      id: string
      handle: string
      description?: string | null
    }>
    const brand = brands.find(
      (b) => (b.handle ?? "").toLowerCase() === BRAND_HANDLE
    )
    if (brand) {
      if (!dryRun) {
        await brandService.updateBrands({
          id: brand.id,
          description: NEW_DESCRIPTION,
        })
      }
      logger.info(`Brand description ${dryRun ? "would be" : ""} updated.`)
    } else {
      logger.warn(`Brand "${BRAND_HANDLE}" not found — skipping description.`)
    }
  } catch (err: any) {
    logger.warn(`Brand description update failed: ${err?.message ?? err}`)
  }

  // 2. Per-product image repair.
  const slugByHandle = new Map(THREAD_LAB_CATALOG.map((s) => [s.handle, s.slug]))
  const coloursByHandle = new Map(
    THREAD_LAB_CATALOG.map((s) => [s.handle, s.colours])
  )
  const handles = THREAD_LAB_CATALOG.map((s) => s.handle)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "variants.id",
      "variants.metadata",
    ],
    filters: { handle: handles },
  })

  let productsTouched = 0
  let variantsUpdated = 0

  for (const product of products ?? []) {
    const slug = slugByHandle.get(product.handle)
    const colours = coloursByHandle.get(product.handle)
    if (!slug || !colours) {
      logger.warn(`  No catalog entry for ${product.handle} — skipping.`)
      continue
    }

    const colourImages = await fetchThreadLabColourImages(slug, colours, logger)
    const emptySet: ColourImageSet = { specific: [], shared: [] }
    const giByColour = new Map<string, ReturnType<typeof buildThreadLabGarmentImages>>()
    for (const c of colours) {
      giByColour.set(c, buildThreadLabGarmentImages(colourImages[c] ?? emptySet))
    }

    let updated = 0
    for (const variant of product.variants ?? []) {
      const meta = ((variant as any).metadata ?? {}) as Record<string, any>
      const colour: string | undefined =
        meta?.thread_lab?.colour_name ?? meta?.garment_color
      if (!colour || !giByColour.has(colour)) continue

      const gi = giByColour.get(colour)
      // Read-modify-write — never clobber bulk_pricing / cost / thread_lab.
      const nextMetadata = {
        ...meta,
        garment_images: gi,
        garment_color: colour,
      }
      if (!dryRun) {
        try {
          await productModule.updateProductVariants(variant.id, {
            metadata: nextMetadata,
          })
        } catch (e: any) {
          logger.warn(`    variant update failed (${variant.id}): ${e?.message ?? e}`)
          continue
        }
      }
      updated++
    }

    // Thumbnail = first colour's real packshot (matches the new import order).
    const firstFront = giByColour.get(colours[0])?.front
    if (firstFront && !dryRun) {
      try {
        await productModule.updateProducts(product.id, { thumbnail: firstFront })
      } catch (e: any) {
        logger.warn(`    thumbnail update failed (${product.handle}): ${e?.message ?? e}`)
      }
    }

    variantsUpdated += updated
    if (updated > 0) productsTouched++
    logger.info(
      `  ${product.title}: ${dryRun ? "would fix" : "fixed"} ${updated} variant(s); thumbnail=${firstFront ? "set" : "—"}`
    )
  }

  logger.info(
    `Done: ${productsTouched} product(s), ${variantsUpdated} variant(s) ${dryRun ? "would be" : ""} updated.`
  )

  // 3. Bust storefront caches so corrected swatches/pictures show immediately.
  if (!dryRun) {
    const purgeTags = new Set<string>(["categories", ...tagsForBrand(BRAND_HANDLE)])
    for (const h of handles) {
      for (const t of tagsForProduct(h)) purgeTags.add(t)
    }
    await revalidateStorefrontTags([...purgeTags], logger)
  }

  logger.info("Thread Lab image repair complete.")
}
