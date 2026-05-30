/**
 * Gildan catalog import — reads the supplier-supplied xlsx, groups
 * (brand, style) into Medusa products, and creates / updates them.
 *
 * Differs from import-fashionbiz-from-api.ts in two ways:
 *   1. The source is a static spreadsheet, not an API — there's no
 *      stock-sync cron because the xlsx carries no on-hand quantities.
 *   2. Image URLs are scraped from gildanbrands.com.au (BigCommerce-
 *      hosted) on the fly because the xlsx ships filenames only.
 *      Cached to disk per (brand, style) so re-runs skip the network.
 *
 * Usage:
 *   GILDAN_XLSX_PATH=/path/to/file.xlsx pnpm --filter backend medusa exec import-gildan-from-xlsx
 *
 * Env vars:
 *   GILDAN_XLSX_PATH             — required, absolute path to the xlsx
 *   IMPORT_LIMIT                 — cap total products processed (for dry runs)
 *   IMPORT_DRY_RUN               — 1/true to log only, no DB writes
 *   IMPORT_UPDATE_EXISTING       — 1/true to ALSO diff + update existing handles
 *                                  (default: skip existing). Picks up corrected
 *                                  titles/descriptions/images and price changes.
 *   GILDAN_COST_ADJUSTMENT       — multiplier on the Classic-tier cost (default 1.0)
 *   GILDAN_IMAGE_SCRAPE_CACHE_DIR — disk cache dir for scraped image URLs
 *                                  (default /tmp/gildan-image-cache)
 *
 * Inventory: Gildan items are configured "always available"
 * (`manage_inventory: false`) per the operator's preference — no stock
 * tracking, no stock location, no daily sync cron.
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { BRAND_MODULE } from "../modules/brand"
import { GILDAN_MODULE } from "../modules/gildan"
import GildanService from "../modules/gildan/service"
import {
  GILDAN_BRAND_HANDLE_BY_NAME,
  GILDAN_BRAND_PARENT_EXTERNAL_CODE,
  GILDAN_BRAND_PARENT_HANDLE,
  GILDAN_BRAND_PARENT_NAME,
} from "../modules/gildan/types"
import type { GildanProduct } from "../modules/gildan/types"
import {
  buildGildanGarmentImages,
  handleForGildanProduct,
  renderGildanDescription,
} from "../modules/gildan/mapping"
import { GildanImageScraper } from "../modules/gildan/image-scraper"
import { GildanSitemapResolver } from "../modules/gildan/sitemap-resolver"
import { priceLadderFromGildan, resolveGildanCost } from "../modules/gildan/pricing"
import {
  ladderToTierMinor,
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../utils/bulk-tier-prices"
import { classifyGildanProduct } from "../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
} from "../lib/supplier-import-pipeline"
import {
  applyProductUpdates,
  type DesiredProduct,
  type ExistingProductRow,
} from "../lib/supplier-product-sync"

const PRICE_CURRENCY_CODE = "aud"

export default async function importGildanFromXlsx({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  let gildan: GildanService
  try {
    gildan = container.resolve(GILDAN_MODULE) as GildanService
  } catch {
    logger.error(
      "Gildan module not registered — restart the backend after enabling the module in medusa-config.js."
    )
    return
  }

  const flags = new Set(args ?? [])
  const limitArg = (args ?? []).find((a) => a.startsWith("--limit="))
  const xlsxPathArg = (args ?? []).find((a) => a.startsWith("--xlsx="))
  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : process.env.IMPORT_LIMIT
      ? Number.parseInt(process.env.IMPORT_LIMIT, 10)
      : undefined
  const dryRun =
    flags.has("--dry-run") ||
    process.env.IMPORT_DRY_RUN === "1" ||
    process.env.IMPORT_DRY_RUN === "true"
  const updateExisting =
    flags.has("--update-existing") ||
    process.env.IMPORT_UPDATE_EXISTING === "1" ||
    process.env.IMPORT_UPDATE_EXISTING === "true"
  const xlsxPath =
    (xlsxPathArg ? xlsxPathArg.split("=")[1] : undefined) ||
    process.env.GILDAN_XLSX_PATH ||
    gildan.getOptions().xlsx_path ||
    ""
  if (!xlsxPath) {
    logger.error(
      "Gildan import requires GILDAN_XLSX_PATH (or --xlsx=...) — pointing to the supplier-supplied .xlsx file."
    )
    return
  }
  const costAdjustment = gildan.getCostAdjustment()

  logger.info(
    `Gildan import — xlsx=${xlsxPath}, limit=${limit ?? "all"}, dryRun=${dryRun}, updateExisting=${updateExisting}, costAdjustment=${costAdjustment}`
  )

  // Parse the xlsx upfront so we fail fast on a missing/corrupt file
  // before resolving any DB-side deps.
  const parseResult = gildan.parseAndGroup(xlsxPath)
  let products = parseResult.products
  logger.info(
    `Parsed ${parseResult.rowsParsed} rows (${parseResult.rowsDropped} dropped) → ${products.length} unique products across ${
      new Set(products.map((p) => p.brand)).size
    } brand(s).`
  )
  if (parseResult.warnings.length) {
    logger.warn(
      `Detected ${parseResult.warnings.length} cross-row drift warning(s); first 10:`
    )
    for (const w of parseResult.warnings.slice(0, 10)) {
      logger.warn(`  ${w}`)
    }
  }
  if (limit) products = products.slice(0, limit)

  // Common Medusa dependencies.
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as any
  const brandService = container.resolve(BRAND_MODULE) as any

  const salesChannels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannels.length) throw new Error("Default Sales Channel not found")
  const defaultSalesChannelId = salesChannels[0].id

  const shippingProfiles = await fulfillmentService.listShippingProfiles({
    type: "default",
  })
  if (!shippingProfiles.length) throw new Error("Default shipping profile not found")
  const shippingProfileId = shippingProfiles[0].id

  // Ensure the Gildan brand entities exist (one parent + three children).
  // Auto-create if missing — staff can re-parent or adjust external codes
  // in admin afterwards. Matches the conservative pattern in FashionBiz
  // but with an extra create-if-missing pass.
  const brandIdByName = await ensureGildanBrands({
    brandService,
    logger,
    dryRun,
  })

  type CreatedCtx = {
    productPayload: any
    gildanProduct: GildanProduct
    colourNames: string[]
  }
  const toCreate: any[] = []
  const created: CreatedCtx[] = []
  const toUpdate = new Map<string, DesiredProduct>()
  const existingByHandle = new Map<string, ExistingProductRow>()
  // For updated products, remember the source so we can replay taxonomy
  // + categories on a post-update pass.
  const gildanByHandleForUpdate = new Map<string, GildanProduct>()

  // 1. Pre-warm the image scraper cache against gildanbrands.com.au.
  // 97 unique styles × ~300ms throttle ≈ 30s for a cold run; subsequent
  // imports hit the disk cache and finish in milliseconds.
  const sitemapResolver = new GildanSitemapResolver({
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
    },
  })
  const scraper = new GildanImageScraper({
    logger: {
      info: (m) => logger.info(m),
      warn: (m) => logger.warn(m),
    },
    sitemapResolver,
  })
  logger.info(
    `Pre-warming image scraper cache for ${products.length} style(s) — first run takes ~${Math.ceil(products.length * 0.4)}s.`
  )
  await scraper.warmCache(
    products.map((p) => ({
      brand: p.brand,
      styleParent: p.styleParent,
      productUrl: p.productUrl,
    }))
  )
  logger.info(
    `Image scraper stats: ${scraper.stats.cacheHits} cached, ${scraper.stats.fetched} fetched, ${scraper.stats.fetchErrors} errors.`
  )

  // 2. Existing-handle lookup — one query for ALL handles in the parse.
  // The graph filter accepts a single array so 5,000 handles in one
  // round-trip is fine.
  const allHandles = products.map((p) =>
    handleForGildanProduct(p.brand, p.styleParent)
  )
  const fields = updateExisting
    ? [
        "id",
        "handle",
        "title",
        "description",
        "thumbnail",
        "material",
        "status",
        "metadata",
        "images.id",
        "images.url",
        "variants.id",
        "variants.sku",
        "variants.title",
        "variants.metadata",
        "variants.prices.id",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "variants.prices.min_quantity",
        "variants.prices.max_quantity",
      ]
    : ["id", "handle"]
  const { data: existingRows } = await query.graph({
    entity: "product",
    fields,
    filters: { handle: allHandles },
  })
  const existingHandles = new Set(
    (existingRows ?? []).map((p: any) => p.handle)
  )
  if (updateExisting) {
    for (const p of (existingRows ?? []) as ExistingProductRow[]) {
      existingByHandle.set(p.handle, p)
    }
  }

  // 3. Build payloads.
  let skippedRunOut = 0
  let skippedNoPrice = 0
  let skippedNoColours = 0
  for (const product of products) {
    const handle = handleForGildanProduct(product.brand, product.styleParent)
    const isExisting = existingHandles.has(handle)
    if (isExisting && !updateExisting) {
      logger.info(`  Skipping existing handle ${handle}`)
      continue
    }

    if (!product.colours.length) {
      skippedNoColours++
      logger.warn(
        `  ${handle}: no colours/sizes after filtering — skipping`
      )
      continue
    }

    const ladder = priceLadderFromGildan(product.classicCost, costAdjustment)
    if (!ladder) {
      skippedNoPrice++
      logger.warn(
        `  ${handle}: no usable Classic cost (got ${product.classicCost ?? "null"}) — skipping`
      )
      continue
    }
    const tierMinor = ladderToTierMinor(ladder)
    const costNumeric = resolveGildanCost(product.classicCost, costAdjustment)
    const costMinor = costNumeric !== null ? Math.round(costNumeric * 100) : null

    // Resolve image URLs for every filename referenced by this product.
    const allFilenames: string[] = []
    for (const c of product.colours) {
      if (c.images.hero) allFilenames.push(c.images.hero)
      for (const v of c.images.views) allFilenames.push(v)
    }
    const { urlByFilename, urlByColour } = await scraper.resolveImageUrls({
      brand: product.brand,
      styleParent: product.styleParent,
      productUrl: product.productUrl,
      filenames: allFilenames,
    })

    // Build options + variants.
    const allSizes = new Set<string>()
    for (const c of product.colours) {
      for (const s of c.sizes) {
        if (s.sizeCode) allSizes.add(s.sizeCode)
      }
    }
    const hasSize = allSizes.size > 1 || (allSizes.size === 1 && !allSizes.has(""))
    const hasColour = product.colours.length > 0
    const options: Array<{ title: string; values: string[] }> = []
    if (hasColour)
      options.push({
        title: "Colour",
        values: product.colours.map((c) => c.name),
      })
    if (hasSize)
      options.push({
        title: "Size",
        values: Array.from(allSizes),
      })
    if (!options.length) options.push({ title: "Default", values: ["Default"] })

    const productImages: Array<{ url: string }> = []
    const seenUrls = new Set<string>()
    for (const c of product.colours) {
      const garmentImages = buildGildanGarmentImages(c, urlByFilename, urlByColour)
      for (const url of garmentImages.all) {
        if (!seenUrls.has(url)) {
          seenUrls.add(url)
          productImages.push({ url })
        }
      }
    }
    const thumbnail = productImages[0]?.url

    const productVariants: any[] = []
    const seenSkus = new Set<string>()
    for (const colour of product.colours) {
      const garmentImages = buildGildanGarmentImages(colour, urlByFilename, urlByColour)
      for (const size of colour.sizes) {
        if (!size.sku || seenSkus.has(size.sku)) continue
        seenSkus.add(size.sku)
        const variantOptions: Record<string, string> = {}
        if (hasColour) variantOptions.Colour = colour.name
        if (hasSize) variantOptions.Size = size.sizeCode
        if (!hasColour && !hasSize) variantOptions.Default = "Default"
        const titleParts = [colour.name, size.sizeCode].filter(Boolean)
        const variantTitle = titleParts.join(" / ") || size.sku

        productVariants.push({
          title: variantTitle,
          sku: size.sku,
          // "Always available" per the operator — no stock tracking.
          manage_inventory: false,
          allow_backorder: true,
          options: variantOptions,
          prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
          metadata: {
            gildan: {
              brand: product.brand,
              style_parent: product.styleParent,
              vendor_sku_child: size.sku,
              size_label: size.sizeLabel,
              size_code: size.sizeCode,
              colour_name: colour.name,
              hex: colour.hex,
              country_of_origin: product.countryOfOrigin,
              weight_grams: product.weightGrams,
            },
            bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, "gildan-xlsx"),
            cost_adjustment: costAdjustment,
            ...(costMinor !== null
              ? { cost_price_ex_gst_minor: costMinor }
              : {}),
            garment_images: garmentImages,
            garment_color: colour.name,
          },
        })
      }
    }
    if (!productVariants.length) {
      skippedNoColours++
      logger.warn(`  ${handle}: no variants after dedupe — skipping`)
      continue
    }

    const productPayload: any = {
      title: product.title,
      handle,
      status: ProductStatus.PUBLISHED,
      description: renderGildanDescription(product),
      thumbnail,
      material: product.fabricContent ?? undefined,
      weight: product.weightGrams ?? undefined,
      images: productImages,
      options,
      variants: productVariants,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
      metadata: {
        source: "gildan",
        gildan: {
          brand: product.brand,
          style_parent: product.styleParent,
          product_url: product.productUrl,
          country_of_origin: product.countryOfOrigin,
          fabric_content: product.fabricContent,
          fabric_weight: product.fabricWeight,
          fit: product.fit,
          gender: product.gender,
          top_tier_category: product.topTierCategory,
          subcategory1: product.subcategory1,
          subcategory2: product.subcategory2,
          features: product.productFeatures,
          rrp_inc: product.rrpInc,
          status: product.status,
          last_sync: new Date().toISOString(),
        },
      },
    }

    if (isExisting) {
      const desired: DesiredProduct = {
        handle,
        title: product.title,
        description: renderGildanDescription(product),
        thumbnail,
        material: product.fabricContent ?? undefined,
        status: ProductStatus.PUBLISHED,
        images: productImages,
        variants: productVariants.map((v: any) => ({
          sku: v.sku,
          title: v.title,
          options: v.options,
          manage_inventory: v.manage_inventory,
          allow_backorder: v.allow_backorder,
          metadata: v.metadata,
          prices: v.prices,
        })),
        metadata: productPayload.metadata,
      }
      toUpdate.set(handle, desired)
      gildanByHandleForUpdate.set(handle, product)
      continue
    }
    toCreate.push(productPayload)
    created.push({
      productPayload,
      gildanProduct: product,
      colourNames: product.colours.map((c) => c.name),
    })
  }

  logger.info(
    `Prepared ${toCreate.length} for create, ${toUpdate.size} for update. Skipped ${skippedRunOut} inactive, ${skippedNoPrice} no-price, ${skippedNoColours} no-colours.`
  )

  if (dryRun) {
    logger.info("Dry run — skipping createProductsWorkflow + update sync.")
    if (toCreate.length) {
      const sample = toCreate[0]
      logger.info(
        `Sample CREATE: handle=${sample.handle} variants=${sample.variants.length} base=$${(sample.variants[0]?.prices?.[0]?.amount ?? 0)}`
      )
    }
    if (toUpdate.size) {
      await applyProductUpdates({
        container,
        desired: toUpdate,
        existing: existingByHandle,
        supplierMetaKey: "gildan",
        logger,
        dryRun: true,
      })
    }
    return
  }
  if (!toCreate.length && !toUpdate.size) {
    logger.info("Nothing to create or update.")
    return
  }

  // 4. Create new products.
  let createdProducts: any[] = []
  if (toCreate.length) {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: toCreate },
    })
    createdProducts = (result as any[]) ?? []
    logger.info(`Created ${createdProducts.length} products.`)

    // Taxonomy + categories — only for created products (matches the
    // FashionBiz pattern).
    const sourceByHandle = new Map<string, GildanProduct>()
    for (const ctx of created)
      sourceByHandle.set(ctx.productPayload.handle, ctx.gildanProduct)
    await applyTaxonomyToProducts(container, {
      products: createdProducts,
      sourceByHandle,
      classify: classifyGildanProduct,
      logger,
    })
    await applyShopCategoriesToProducts(container, createdProducts, logger)

    // Brand links — group by brand id, batch-link.
    const productsByBrandId = new Map<string, Array<{ id: string; handle: string }>>()
    for (const ctx of created) {
      const brandId = brandIdByName.get(ctx.gildanProduct.brand)
      if (!brandId) {
        logger.warn(
          `  No Brand entity for "${ctx.gildanProduct.brand}" — product ${ctx.productPayload.handle} unlinked.`
        )
        continue
      }
      const createdRow = createdProducts.find(
        (p) => (p as any).handle === ctx.productPayload.handle
      )
      if (!createdRow) continue
      if (!productsByBrandId.has(brandId)) productsByBrandId.set(brandId, [])
      productsByBrandId.get(brandId)!.push(createdRow as { id: string; handle: string })
    }
    for (const [brandId, ps] of productsByBrandId) {
      await linkProductsToBrand(container, ps, brandId)
    }
  }

  // 5. Update existing products via the diff helper.
  if (toUpdate.size) {
    const { summary } = await applyProductUpdates({
      container,
      desired: toUpdate,
      existing: existingByHandle,
      supplierMetaKey: "gildan",
      logger,
    })
    logger.info(
      `Update summary: ${summary.productsUpdated} touched (${summary.productsUnchanged} unchanged), ${summary.variantsAdded} new variants, ${summary.variantsUpdated} variant patches, ${summary.errors} errors.`
    )
  }

  logger.info("Gildan import complete.")
}

/**
 * Ensure the four Gildan brand entities exist (parent + 3 children).
 * Returns a Map<brand_name_from_xlsx, brand_id>. Auto-creates missing
 * brands; existing brands are reused regardless of who created them.
 *
 * Side-effect: re-parents children under the canonical parent when
 * the parent already exists but a child has `parent_id = null`.
 */
async function ensureGildanBrands(opts: {
  brandService: any
  logger: { info: (m: string) => void; warn: (m: string) => void }
  dryRun?: boolean
}): Promise<Map<string, string>> {
  const { brandService, logger, dryRun } = opts
  const result = new Map<string, string>()

  const allBrands = (await brandService.listBrands({})) as Array<{
    id: string
    name: string
    handle: string
    external_code: string | null
    parent_id: string | null
  }>
  const byHandle = new Map<string, (typeof allBrands)[number]>()
  for (const b of allBrands) byHandle.set((b.handle ?? "").toLowerCase(), b)

  // Parent first — we need its ID to set parent_id on the children.
  let parent = byHandle.get(GILDAN_BRAND_PARENT_HANDLE)
  if (!parent && !dryRun) {
    const [created] = await brandService.createBrands([
      {
        name: GILDAN_BRAND_PARENT_NAME,
        handle: GILDAN_BRAND_PARENT_HANDLE,
        external_code: GILDAN_BRAND_PARENT_EXTERNAL_CODE,
        parent_id: null,
      },
    ])
    parent = created
    logger.info(
      `Created Brand "${GILDAN_BRAND_PARENT_NAME}" (id ${created.id}).`
    )
  } else if (!parent) {
    logger.info(`[dry-run] Would create Brand "${GILDAN_BRAND_PARENT_NAME}".`)
  }

  for (const [name, handle] of Object.entries(GILDAN_BRAND_HANDLE_BY_NAME)) {
    const existing = byHandle.get(handle)
    if (existing) {
      result.set(name, existing.id)
      // Re-parent if needed.
      if (!existing.parent_id && parent && !dryRun) {
        try {
          await brandService.updateBrands(existing.id, {
            parent_id: parent.id,
          })
          logger.info(
            `Re-parented Brand "${name}" → "${GILDAN_BRAND_PARENT_NAME}".`
          )
        } catch (err: any) {
          logger.warn(
            `Failed to re-parent Brand "${name}": ${err?.message ?? err}`
          )
        }
      }
    } else if (!dryRun) {
      const [created] = await brandService.createBrands([
        {
          name,
          handle,
          external_code: null,
          parent_id: parent?.id ?? null,
        },
      ])
      result.set(name, created.id)
      logger.info(`Created Brand "${name}" (id ${created.id}, handle ${handle}).`)
    } else {
      logger.info(`[dry-run] Would create Brand "${name}" (handle ${handle}).`)
    }
  }
  return result
}
