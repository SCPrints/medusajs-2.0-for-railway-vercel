/**
 * POST /admin/gildan/import
 *
 * Accepts a base64-encoded Gildan xlsx file plus the standard run flags
 * (dryRun, updateExisting, limit) and runs the same logic as
 * `import-gildan-from-xlsx.ts` end-to-end. Returns the full result +
 * captured logs so the admin UI can show what happened without needing
 * a separate progress stream.
 *
 * The whole import is synchronous because the slow part — image scraping
 * — is short-circuited by the on-disk filename→URL cache; the first run
 * for a fresh xlsx is ~30s, every subsequent run is sub-second.
 *
 * Body shape:
 *   {
 *     fileBase64: string         // required, full xlsx file base64-encoded
 *     filename?: string          // optional metadata, defaults to "gildan.xlsx"
 *     dryRun?: boolean           // default false
 *     updateExisting?: boolean   // default false — IMPORT_UPDATE_EXISTING semantics
 *     limit?: number             // optional product cap
 *   }
 *
 * Response shape:
 *   {
 *     ok: boolean
 *     parsedRows: number
 *     groupedProducts: number
 *     toCreate: number
 *     toUpdate: number
 *     created: number
 *     updated: number
 *     variantsAdded: number
 *     errors: number
 *     warnings: string[]
 *     logs: string[]
 *     imageScraperStats: { cacheHits, fetched, fetchErrors }
 *   }
 */

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { BRAND_MODULE } from "../../../../modules/brand"
import { GILDAN_MODULE } from "../../../../modules/gildan"
import GildanService from "../../../../modules/gildan/service"
import {
  GILDAN_BRAND_HANDLE_BY_NAME,
  GILDAN_BRAND_PARENT_EXTERNAL_CODE,
  GILDAN_BRAND_PARENT_HANDLE,
  GILDAN_BRAND_PARENT_NAME,
} from "../../../../modules/gildan/types"
import type { GildanProduct } from "../../../../modules/gildan/types"
import {
  buildGildanGarmentImages,
  handleForGildanProduct,
  renderGildanDescription,
} from "../../../../modules/gildan/mapping"
import { GildanImageScraper } from "../../../../modules/gildan/image-scraper"
import {
  priceLadderFromGildan,
  resolveGildanCost,
} from "../../../../modules/gildan/pricing"
import {
  ladderToTierMinor,
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../../../../utils/bulk-tier-prices"
import { classifyGildanProduct } from "../../../../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
} from "../../../../lib/supplier-import-pipeline"
import {
  applyProductUpdates,
  type DesiredProduct,
  type ExistingProductRow,
} from "../../../../lib/supplier-product-sync"

const PRICE_CURRENCY_CODE = "aud"

/**
 * Captured-log wrapper. Lets the importer write `logger.info(...)` while
 * we collect all messages in an array to return to the admin UI. Falls
 * through to the underlying framework logger so server-side logs still
 * receive everything.
 */
function makeCapturedLogger(baseLogger: any) {
  const logs: string[] = []
  const capture = (level: string, msg: string) => {
    logs.push(`[${level}] ${msg}`)
  }
  return {
    logger: {
      info: (m: string) => {
        capture("info", m)
        baseLogger?.info?.(m)
      },
      warn: (m: string) => {
        capture("warn", m)
        baseLogger?.warn?.(m)
      },
      error: (m: string) => {
        capture("error", m)
        baseLogger?.error?.(m)
      },
      debug: (m: string) => {
        baseLogger?.debug?.(m)
      },
    },
    logs,
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const baseLogger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any
  const { logger, logs } = makeCapturedLogger(baseLogger)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let gildan: GildanService
  try {
    gildan = req.scope.resolve(GILDAN_MODULE) as GildanService
  } catch {
    return res
      .status(503)
      .json({ ok: false, error: "Gildan module not registered." })
  }

  const body = (req.body ?? {}) as {
    fileBase64?: string
    filename?: string
    dryRun?: boolean
    updateExisting?: boolean
    limit?: number
  }
  if (!body.fileBase64 || typeof body.fileBase64 !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "Missing fileBase64 in body" })
  }
  const dryRun = !!body.dryRun
  const updateExisting = !!body.updateExisting
  const limit = body.limit && body.limit > 0 ? body.limit : undefined
  const costAdjustment = gildan.getCostAdjustment()

  // Persist the upload to a temp file so the parser (XLSX.readFile) can
  // read it from disk. Cleaned up at the end regardless of outcome.
  const tmpName = `gildan-${crypto.randomBytes(6).toString("hex")}.xlsx`
  const tmpPath = path.join(os.tmpdir(), tmpName)
  try {
    fs.writeFileSync(tmpPath, Buffer.from(body.fileBase64, "base64"))
  } catch (err: any) {
    return res
      .status(400)
      .json({
        ok: false,
        error: `Failed to write upload to disk: ${err?.message ?? err}`,
      })
  }

  try {
    logger.info(
      `Gildan admin import: dryRun=${dryRun}, updateExisting=${updateExisting}, limit=${limit ?? "all"}, costAdjustment=${costAdjustment}`
    )
    const parseResult = gildan.parseAndGroup(tmpPath)
    let products = parseResult.products
    logger.info(
      `Parsed ${parseResult.rowsParsed} rows (${parseResult.rowsDropped} dropped) → ${products.length} unique products.`
    )
    if (parseResult.warnings.length) {
      logger.warn(
        `${parseResult.warnings.length} cross-row drift warning(s) (first 5 shown).`
      )
      for (const w of parseResult.warnings.slice(0, 5)) logger.warn(w)
    }
    if (limit) products = products.slice(0, limit)

    const salesChannelService = req.scope.resolve(Modules.SALES_CHANNEL) as any
    const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT) as any
    const brandService = req.scope.resolve(BRAND_MODULE) as any

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

    const scraper = new GildanImageScraper({ logger })
    logger.info(
      `Pre-warming image scraper cache for ${products.length} style(s)…`
    )
    await scraper.warmCache(
      products.map((p) => ({
        brand: p.brand,
        styleParent: p.styleParent,
        productUrl: p.productUrl,
      }))
    )
    logger.info(
      `Image scraper: ${scraper.stats.cacheHits} cached, ${scraper.stats.fetched} fetched, ${scraper.stats.fetchErrors} errors.`
    )

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

    let skippedNoPrice = 0
    let skippedNoColours = 0
    for (const product of products) {
      const handle = handleForGildanProduct(product.brand, product.styleParent)
      const isExisting = existingHandles.has(handle)
      if (isExisting && !updateExisting) continue

      if (!product.colours.length) {
        skippedNoColours++
        continue
      }
      const ladder = priceLadderFromGildan(product.classicCost, costAdjustment)
      if (!ladder) {
        skippedNoPrice++
        logger.warn(
          `${handle}: no usable Classic cost (got ${product.classicCost ?? "null"})`
        )
        continue
      }
      const tierMinor = ladderToTierMinor(ladder)
      const costNumeric = resolveGildanCost(product.classicCost, costAdjustment)
      const costMinor =
        costNumeric !== null ? Math.round(costNumeric * 100) : null

      const allFilenames: string[] = []
      for (const c of product.colours) {
        if (c.images.hero) allFilenames.push(c.images.hero)
        for (const v of c.images.views) allFilenames.push(v)
      }
      const urlByFilename = await scraper.resolveImageUrls({
        brand: product.brand,
        styleParent: product.styleParent,
        productUrl: product.productUrl,
        filenames: allFilenames,
      })

      const allSizes = new Set<string>()
      for (const c of product.colours)
        for (const s of c.sizes) if (s.sizeCode) allSizes.add(s.sizeCode)
      const hasSize = allSizes.size > 0
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
      if (!options.length)
        options.push({ title: "Default", values: ["Default"] })

      const productImages: Array<{ url: string }> = []
      const seenUrls = new Set<string>()
      for (const c of product.colours) {
        const garmentImages = buildGildanGarmentImages(c, urlByFilename)
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
        const garmentImages = buildGildanGarmentImages(colour, urlByFilename)
        for (const size of colour.sizes) {
          if (!size.sku || seenSkus.has(size.sku)) continue
          seenSkus.add(size.sku)
          const variantOptions: Record<string, string> = {}
          if (hasColour) variantOptions.Colour = colour.name
          if (hasSize) variantOptions.Size = size.sizeCode
          if (!hasColour && !hasSize) variantOptions.Default = "Default"
          productVariants.push({
            title: [colour.name, size.sizeCode].filter(Boolean).join(" / ") || size.sku,
            sku: size.sku,
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
        toUpdate.set(handle, {
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
        })
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
      `Prepared ${toCreate.length} create + ${toUpdate.size} update. Skipped ${skippedNoPrice} no-price, ${skippedNoColours} no-colours.`
    )

    let createdCount = 0
    let updatedCount = 0
    let variantsAddedCount = 0
    let updateErrors = 0

    if (!dryRun) {
      let createdProducts: any[] = []
      if (toCreate.length) {
        const { result } = await createProductsWorkflow(req.scope).run({
          input: { products: toCreate },
        })
        createdProducts = (result as any[]) ?? []
        createdCount = createdProducts.length
        logger.info(`Created ${createdCount} products.`)
        const sourceByHandle = new Map<string, GildanProduct>()
        for (const ctx of created)
          sourceByHandle.set(ctx.productPayload.handle, ctx.gildanProduct)
        await applyTaxonomyToProducts(req.scope, {
          products: createdProducts,
          sourceByHandle,
          classify: classifyGildanProduct,
          logger,
        })
        await applyShopCategoriesToProducts(req.scope, createdProducts, logger)
        const productsByBrandId = new Map<
          string,
          Array<{ id: string; handle: string }>
        >()
        for (const ctx of created) {
          const brandId = brandIdByName.get(ctx.gildanProduct.brand)
          if (!brandId) continue
          const row = createdProducts.find(
            (p) => (p as any).handle === ctx.productPayload.handle
          )
          if (!row) continue
          if (!productsByBrandId.has(brandId)) productsByBrandId.set(brandId, [])
          productsByBrandId
            .get(brandId)!
            .push(row as { id: string; handle: string })
        }
        for (const [brandId, ps] of productsByBrandId) {
          await linkProductsToBrand(req.scope, ps, brandId)
        }
      }
      if (toUpdate.size) {
        const { summary } = await applyProductUpdates({
          container: req.scope,
          desired: toUpdate,
          existing: existingByHandle,
          supplierMetaKey: "gildan",
          logger,
        })
        updatedCount = summary.productsUpdated
        variantsAddedCount = summary.variantsAdded
        updateErrors = summary.errors
      }
    }

    return res.json({
      ok: true,
      parsedRows: parseResult.rowsParsed,
      groupedProducts: products.length,
      toCreate: toCreate.length,
      toUpdate: toUpdate.size,
      created: createdCount,
      updated: updatedCount,
      variantsAdded: variantsAddedCount,
      errors: updateErrors,
      warnings: parseResult.warnings,
      logs,
      imageScraperStats: scraper.stats,
    })
  } catch (err: any) {
    logger.error(`Gildan import failed: ${err?.message ?? err}`)
    return res
      .status(500)
      .json({ ok: false, error: err?.message ?? String(err), logs })
  } finally {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // best-effort cleanup
    }
  }
}

/** Mirror of `ensureGildanBrands` in the CLI script. Kept inline to avoid
 *  refactor risk with the script — extract to a shared helper if we
 *  add a third caller. */
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
    parent_id: string | null
  }>
  const byHandle = new Map<string, (typeof allBrands)[number]>()
  for (const b of allBrands) byHandle.set((b.handle ?? "").toLowerCase(), b)

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
    logger.info(`Created Brand "${GILDAN_BRAND_PARENT_NAME}".`)
  }
  for (const [name, handle] of Object.entries(GILDAN_BRAND_HANDLE_BY_NAME)) {
    const existing = byHandle.get(handle)
    if (existing) {
      result.set(name, existing.id)
      if (!existing.parent_id && parent && !dryRun) {
        try {
          await brandService.updateBrands(existing.id, { parent_id: parent.id })
          logger.info(`Re-parented Brand "${name}" → "${GILDAN_BRAND_PARENT_NAME}".`)
        } catch {
          // tolerate failures — staff can re-parent in admin
        }
      }
    } else if (!dryRun) {
      const [createdRow] = await brandService.createBrands([
        {
          name,
          handle,
          external_code: null,
          parent_id: parent?.id ?? null,
        },
      ])
      result.set(name, createdRow.id)
      logger.info(`Created Brand "${name}".`)
    }
  }
  return result
}
