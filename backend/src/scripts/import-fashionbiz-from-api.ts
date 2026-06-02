/**
 * FashionBiz catalog import.
 *
 * Mirrors the AS Colour script. Pulls every product for the requested
 * FashionBiz brands via the public v3 API, creates Medusa products +
 * variants (one per colour/size), links them to the right Brand entity,
 * and seeds initial inventory levels at the "FashionBiz Warehouse"
 * stock location.
 *
 * Usage:
 *   IMPORT_BRANDS=biz-collection,syzmik IMPORT_LIMIT=5 IMPORT_DRY_RUN=1 \
 *     pnpm --filter backend medusa exec import-fashionbiz-from-api
 *
 * Env vars (medusa exec eats `--flags` via yargs, so env is canonical):
 *   IMPORT_LIMIT             — cap products per brand
 *   IMPORT_DRY_RUN           — 1/true to log only, no DB writes
 *   IMPORT_BRANDS            — comma-separated subset of:
 *                              biz-collection, biz-care, biz-corporates, syzmik
 *                              Default: all four.
 *   IMPORT_UPDATE_EXISTING   — 1/true to ALSO diff + update existing handles
 *                              instead of skipping them. Picks up corrected
 *                              titles/descriptions/images, new colour
 *                              variants, and supplier price changes.
 *                              Defaults off so re-runs stay create-only.
 *
 * Idempotency:
 *   - Without IMPORT_UPDATE_EXISTING: create-only, keyed by handle
 *     (`{brand}-{slug}`); existing handles skipped.
 *   - With IMPORT_UPDATE_EXISTING: new handles still create; existing
 *     handles flow through `applyProductUpdates` which:
 *       - only writes when the diff is non-empty
 *       - preserves staff metadata customisations
 *       - appends new image URLs without removing existing ones
 *       - leaves variants present only in the database alone (don't break
 *         re-orders for colours FashionBiz has since dropped).
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { FASHIONBIZ_MODULE } from "../modules/fashionbiz"
import FashionBizService from "../modules/fashionbiz/service"
import {
  FashionBizBrandSlug,
  FashionBizColour,
  FashionBizProduct,
} from "../modules/fashionbiz/types"
import { priceLadderFromFashionBiz, resolveFashionBizCost } from "../modules/fashionbiz/pricing"
import {
  ladderToTierMinor,
  tierMinorToPriceSetRows,
  tierMinorToBulkPricingMetadata,
} from "../utils/bulk-tier-prices"
import {
  buildGarmentImagesForColour,
  collectImageUrls,
  handleForProduct,
  renderDescription,
  titleCase,
} from "../modules/fashionbiz/mapping"
import { BRAND_MODULE } from "../modules/brand"
import { classifyFashionBizProduct } from "../lib/product-taxonomy"
import { parseGsm } from "../utils/parse-gsm"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
  seedInventoryLevels,
} from "../lib/supplier-import-pipeline"
import {
  applyProductUpdates,
  type DesiredProduct,
  type ExistingProductRow,
} from "../lib/supplier-product-sync"

const PRICE_CURRENCY_CODE = "aud"
const FASHIONBIZ_LOCATION_NAME = "FashionBiz Warehouse"

/**
 * FashionBiz brand slug -> Brand entity handle. The Brand rows for these
 * handles are already seeded by migrate-products-to-brand-entity.ts; if
 * any are missing we hard-fail rather than auto-create, because parenting
 * (under FashionBiz) is set by the migration and we don't want to
 * accidentally orphan them.
 */
const BRAND_HANDLE_BY_FASHIONBIZ_SLUG: Record<FashionBizBrandSlug, string> = {
  "biz-collection": "biz-collection",
  "biz-care": "biz-care",
  "biz-corporates": "biz-corporates",
  syzmik: "syzmik",
  "good-mates": "good-mates", // not used in the default first-pass set
}

const DEFAULT_BRANDS: FashionBizBrandSlug[] = [
  "biz-collection",
  "biz-care",
  "biz-corporates",
  "syzmik",
]

/** Sleep helper for between-request throttling. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function parseBrandsEnv(value: string | undefined): FashionBizBrandSlug[] {
  if (!value) return DEFAULT_BRANDS
  const valid = new Set<FashionBizBrandSlug>([
    "biz-collection",
    "biz-care",
    "biz-corporates",
    "syzmik",
    "good-mates",
  ])
  const requested = value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as FashionBizBrandSlug[]
  const filtered = requested.filter((b) => valid.has(b))
  if (!filtered.length) return DEFAULT_BRANDS
  return filtered
}

export default async function importFashionBizFromApi({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  let fashionbiz: FashionBizService
  try {
    fashionbiz = container.resolve(FASHIONBIZ_MODULE) as FashionBizService
  } catch {
    logger.error(
      "FashionBiz module not registered — set FASHIONBIZ_API_TOKEN and restart."
    )
    return
  }

  const flags = new Set(args ?? [])
  const limitArg = (args ?? []).find((a) => a.startsWith("--limit="))
  const envLimit = process.env.IMPORT_LIMIT
  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : envLimit
      ? Number.parseInt(envLimit, 10)
      : undefined
  const dryRun =
    flags.has("--dry-run") ||
    process.env.IMPORT_DRY_RUN === "1" ||
    process.env.IMPORT_DRY_RUN === "true"
  const updateExisting =
    flags.has("--update-existing") ||
    process.env.IMPORT_UPDATE_EXISTING === "1" ||
    process.env.IMPORT_UPDATE_EXISTING === "true"
  const brands = parseBrandsEnv(process.env.IMPORT_BRANDS)
  const costAdjustment = fashionbiz.getCostAdjustment()

  logger.info(
    `FashionBiz import — brands=[${brands.join(", ")}], limit=${limit ?? "all"}, dryRun=${dryRun}, updateExisting=${updateExisting}, costAdjustment=${costAdjustment}`
  )
  if (costAdjustment === 1.0) {
    logger.warn(
      "FASHIONBIZ_COST_ADJUSTMENT is 1.0 — using raw API '1-99' tier price as cost. The distributor storefront typically charges ~15% above this; set FASHIONBIZ_COST_ADJUSTMENT=1.15 to match."
    )
  }

  // Common dependencies
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as any
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const brandService = container.resolve(BRAND_MODULE) as any

  const salesChannels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannels.length) throw new Error("Default Sales Channel not found")
  const defaultSalesChannelId = salesChannels[0].id

  const shippingProfiles = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!shippingProfiles.length) throw new Error("Default shipping profile not found")
  const shippingProfileId = shippingProfiles[0].id

  // Stock location for FashionBiz-managed stock
  let locationId: string | null = null
  const existingLocations = await stockLocationService.listStockLocations({
    name: FASHIONBIZ_LOCATION_NAME,
  })
  if (existingLocations.length) {
    locationId = existingLocations[0].id
  } else if (!dryRun) {
    const created = await stockLocationService.createStockLocations({
      name: FASHIONBIZ_LOCATION_NAME,
    })
    locationId = Array.isArray(created) ? created[0].id : created.id
    logger.info(`Created stock location ${FASHIONBIZ_LOCATION_NAME} (${locationId})`)
  }

  // Ensure the stock location is linked to all sales channels — without this
  // the storefront returns variant.inventory_quantity = 0 for FashionBiz
  // variants (stock exists at the location, but the channel can't see it).
  // Idempotent — Medusa's workflow no-ops when the link already exists.
  if (locationId && !dryRun) {
    const allChannels = (await salesChannelService.listSalesChannels(
      {},
      { take: 500 }
    )) as Array<{ id: string }>
    const channelIds = allChannels.map((c) => c.id)
    if (channelIds.length > 0) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: locationId, add: channelIds },
      })
      logger.info(
        `Linked ${channelIds.length} sales channel(s) to ${FASHIONBIZ_LOCATION_NAME}`
      )
    }
  }

  // Resolve Brand entities by handle. Hard-fail with a clear message if any
  // requested brand isn't seeded — the migration is supposed to create them.
  const allBrands = (await brandService.listBrands({})) as Array<{
    id: string
    name: string
    handle: string
  }>
  const brandIdByFashionBizSlug: Partial<Record<FashionBizBrandSlug, string>> = {}
  for (const slug of brands) {
    const targetHandle = BRAND_HANDLE_BY_FASHIONBIZ_SLUG[slug]
    const brand = allBrands.find((b) => (b.handle ?? "").toLowerCase() === targetHandle)
    if (!brand) {
      throw new Error(
        `Brand "${targetHandle}" missing. Run \`pnpm medusa exec migrate-products-to-brand-entity -- --apply\` first.`
      )
    }
    brandIdByFashionBizSlug[slug] = brand.id
  }

  type CreatedProductContext = {
    brand: FashionBizBrandSlug
    slug: string
    productPayload: any
    colourNames: string[]
    fashionBizProduct: FashionBizProduct
  }
  const toCreate: any[] = []
  const created: CreatedProductContext[] = []
  // Desired payloads for handles that already exist, keyed by handle. Only
  // populated when IMPORT_UPDATE_EXISTING=1 — those flow through the diff
  // helper instead of createProductsWorkflow.
  const toUpdate = new Map<string, DesiredProduct>()
  // Full graph-queried existing products (variants, prices, images, metadata)
  // — only populated when IMPORT_UPDATE_EXISTING=1, where the diff needs them.
  const existingByHandle = new Map<string, ExistingProductRow>()
  let skippedClearance = 0

  // Skip-list: existing handles across all brands in scope. We collect all
  // candidate handles up front, then check against Medusa in one graph
  // query per brand batch (cheaper than per-product).
  type BrandBatch = {
    brand: FashionBizBrandSlug
    products: FashionBizProduct[]
  }
  const batches: BrandBatch[] = []

  // 1. Fetch product lists per brand
  for (const brand of brands) {
    logger.info(`Fetching ${brand} catalog…`)
    let stubs = await fashionbiz.fetchAllProductsForBrand(brand)
    if (limit) stubs = stubs.slice(0, limit)
    logger.info(`  ${brand}: ${stubs.length} products`)

    // 2. Fetch detail per product, throttled
    const details: FashionBizProduct[] = []
    for (const stub of stubs) {
      try {
        const detail = await fashionbiz.fetchProductDetail(brand, stub.slug)
        details.push(detail)
      } catch (err: any) {
        logger.warn(`Failed to fetch ${brand}/${stub.slug}: ${err?.message ?? err}`)
      }
      await sleep(200) // ~5 req/sec
    }
    batches.push({ brand, products: details })
  }

  // 3. Existing-handle lookup (one query per brand). When updateExisting is
  // off we only need `id, handle` for the skip set. When updateExisting is
  // on we pull the full graph so the diff helper can compare title,
  // description, images, variants, prices, and metadata.
  for (const batch of batches) {
    const handles = batch.products.map((p) => handleForProduct(batch.brand, p.slug))
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
    const { data: existing } = await query.graph({
      entity: "product",
      fields,
      filters: { handle: handles },
    })
    const existingHandles = new Set((existing ?? []).map((p: any) => p.handle))
    if (updateExisting) {
      for (const p of (existing ?? []) as ExistingProductRow[]) {
        existingByHandle.set(p.handle, p)
      }
    }

    // 4. Build create + update payloads
    for (const product of batch.products) {
      const handle = handleForProduct(batch.brand, product.slug)
      const isExisting = existingHandles.has(handle)
      if (isExisting && !updateExisting) {
        logger.info(`  Skipping existing handle ${handle}`)
        continue
      }

      // FashionBiz `sales_status` of "clearance" means the style is being
      // run out — don't add it to the catalog. Case-insensitive to be
      // tolerant of casing drift.
      if ((product.sales_status ?? "").trim().toLowerCase() === "clearance") {
        skippedClearance++
        logger.info(
          `  Skipping ${batch.brand}/${product.slug} (${product.name}) — sales_status=clearance`
        )
        continue
      }

      const ladder = priceLadderFromFashionBiz(product.prices, costAdjustment)
      if (!ladder) {
        logger.warn(
          `  ${batch.brand}/${product.slug}: no usable prices — skipping (FashionBiz returned ${product.prices?.length ?? 0} tiers)`
        )
        continue
      }
      const tierMinor = ladderToTierMinor(ladder)
      const fbCost = resolveFashionBizCost(product.prices, costAdjustment)
      const fbCostMinor = fbCost !== null ? Math.round(fbCost * 100) : null

      const colours = (product.colors ?? []).filter(
        (c): c is FashionBizColour => !!c && (c.sizes?.length ?? 0) > 0
      )
      if (!colours.length) {
        logger.warn(`  ${batch.brand}/${product.slug}: no colours with sizes — skipping`)
        continue
      }

      const sizes = new Set<string>()
      const colourNames = new Set<string>()
      for (const c of colours) {
        colourNames.add(c.name)
        for (const s of c.sizes ?? []) {
          if (s.size) sizes.add(s.size)
        }
      }
      const hasSize = sizes.size > 0
      const hasColour = colourNames.size > 0

      const options: { title: string; values: string[] }[] = []
      if (hasColour) options.push({ title: "Colour", values: Array.from(colourNames) })
      if (hasSize) options.push({ title: "Size", values: Array.from(sizes) })
      if (!options.length) options.push({ title: "Default", values: ["Default"] })

      const productImages = collectImageUrls(product).map((url) => ({ url }))
      const thumbnail =
        productImages.find((img) => img.url.includes("_Talent_"))?.url ??
        productImages[0]?.url

      // One variant per (colour, size). The same SKU appearing twice in
      // the API (defensively) is skipped to keep Medusa happy.
      const productVariants: any[] = []
      const seenSkus = new Set<string>()
      for (const colour of colours) {
        for (const size of colour.sizes ?? []) {
          if (!size.sku || seenSkus.has(size.sku)) continue
          seenSkus.add(size.sku)

          const variantOptions: Record<string, string> = {}
          if (hasColour) variantOptions["Colour"] = colour.name
          if (hasSize) variantOptions["Size"] = size.size
          if (!hasColour && !hasSize) variantOptions["Default"] = "Default"

          const titleParts = [colour.name, size.size].filter(Boolean)
          const variantTitle = titleParts.join(" / ") || size.sku

          productVariants.push({
            title: variantTitle,
            sku: size.sku,
            manage_inventory: true,
            allow_backorder: false,
            options: variantOptions,
            // 5 price-set rows (qty bands 1-9 / 10-19 / 20-49 / 50-99 / 100+)
            // built via the shared helper so FashionBiz, AS Colour, and the
            // spreadsheet-sync path all emit byte-identical rows.
            prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
            metadata: {
              fashionbiz: {
                product_id: product.id,
                product_slug: product.slug,
                product_code: product.code,
                color_id: colour.id,
                color_name: colour.name,
                size_id: size.id,
                size: size.size,
                hex_value: colour.hex_value ?? colour.tag_value ?? null,
              },
              // Storefront reads `metadata.bulk_pricing.tiers` (array of
              // {min_quantity, max_quantity, amount}) — same shape every
              // other importer writes.
              bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, "fashionbiz-api"),
              raw_prices: product.prices ?? [],
              cost_adjustment: costAdjustment,
              // Canonical ex-GST cost in minor units — read by the tier-pricing
              // regen job. See `backend/src/lib/customer-tiers.ts`.
              ...(fbCostMinor !== null ? { cost_price_ex_gst_minor: fbCostMinor } : {}),
              garment_images: buildGarmentImagesForColour(colour),
              garment_color: colour.name,
            },
          })
        }
      }

      if (!productVariants.length) {
        logger.warn(`  ${batch.brand}/${product.slug}: no variants after dedupe — skipping`)
        continue
      }

      const title = product.name ? titleCase(product.name) : `FashionBiz ${product.code}`

      // FashionBiz embeds GSM in the fabric description strings, e.g.
      // "60% Cotton, 40% Polyester; 190 GSM; 4-way stretch". Extract the
      // first numeric match across all fabric items.
      const gsmFabricItems: string[] = product.description?.fabric
        ? (Array.isArray(product.description.fabric)
            ? product.description.fabric
            : [product.description.fabric])
        : []
      const gsm = gsmFabricItems.map((s) => parseGsm(s)).find((n) => n !== null) ?? null

      const productPayload: any = {
        title,
        handle,
        status: ProductStatus.PUBLISHED,
        description: renderDescription(product.description),
        thumbnail,
        material: product.fabric ?? undefined,
        images: productImages,
        options,
        variants: productVariants,
        shipping_profile_id: shippingProfileId,
        sales_channels: [{ id: defaultSalesChannelId }],
        metadata: {
          source: "fashionbiz",
          ...(gsm !== null ? { gsm } : {}),
          fashionbiz: {
            id: product.id,
            slug: product.slug,
            code: product.code,
            brand_slug: batch.brand,
            sales_status: product.sales_status,
            tags: product.tags ?? [],
            fit: product.fit,
            gender: product.gender,
            sleeve: product.sleeve,
            industry: product.industry,
            tech: product.tech,
            seo_title: product.seo_title,
            seo_metadesc: product.seo_metadesc,
            seo_focuskw: product.seo_focuskw,
            stylesheet: product.stylesheet,
            catwalk_url: product.catwalk_url,
            last_sync: new Date().toISOString(),
          },
        },
        // SEO fields if Medusa supports them on product create (they're
        // stored in metadata above too, so safe either way).
      }

      if (isExisting) {
        // Update path — keep the create payload (same shape) but route it
        // through the diff helper instead of createProductsWorkflow. Skip
        // the unused create-only fields when building the desired payload
        // so they don't end up in updateProductsWorkflow's input.
        const desired: DesiredProduct = {
          handle,
          title,
          description: renderDescription(product.description),
          thumbnail,
          material: product.fabric ?? undefined,
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
        continue
      }
      toCreate.push(productPayload)
      created.push({
        brand: batch.brand,
        slug: product.slug,
        productPayload,
        colourNames: Array.from(colourNames),
        fashionBizProduct: product,
      })
    }
  }

  logger.info(
    `Prepared ${toCreate.length} for create, ${toUpdate.size} for update. Skipped ${skippedClearance} clearance style(s).`
  )

  if (dryRun) {
    logger.info("Dry run — skipping createProductsWorkflow + inventory seed.")
    if (toCreate.length) {
      const sample = toCreate[0]
      logger.info(
        `Sample CREATE payload: handle=${sample.handle}, variants=${sample.variants.length}, base price=$${(sample.variants[0]?.prices?.[0]?.amount ?? 0) / 100}`
      )
    }
    if (toUpdate.size) {
      await applyProductUpdates({
        container,
        desired: toUpdate,
        existing: existingByHandle,
        supplierMetaKey: "fashionbiz",
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

  // 5. Create products (only when there ARE new handles — updates fall
  // through to the diff helper further down).
  let createdProducts: any[] = []
  if (toCreate.length) {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: toCreate },
    })
    createdProducts = (result as any[]) ?? []
    logger.info(`Created ${createdProducts.length} products.`)
  }

  // 5b. Taxonomy — classify + title fallbacks + persist product_type/tags.
  const fbByHandle = new Map<string, FashionBizProduct>()
  for (const ctx of created) {
    fbByHandle.set(ctx.productPayload.handle, ctx.fashionBizProduct)
  }
  await applyTaxonomyToProducts(container, {
    products: createdProducts,
    sourceByHandle: fbByHandle,
    classify: classifyFashionBizProduct,
    logger,
  })

  // 5c. Shop categories.
  await applyShopCategoriesToProducts(container, createdProducts, logger)

  // 5d. Link each created product to its brand. We group by handle and
  // batch-link per brand so a single `created` context can carry products
  // from multiple FashionBiz brands (Biz Collection, Syzmik, etc.).
  const productsByBrandId = new Map<
    string,
    Array<{ id: string; handle: string }>
  >()
  for (const ctx of created) {
    const brandId = brandIdByFashionBizSlug[ctx.brand]
    if (!brandId) continue
    const created = createdProducts.find(
      (p) => (p as any).handle === ctx.productPayload.handle
    )
    if (!created) continue
    if (!productsByBrandId.has(brandId)) productsByBrandId.set(brandId, [])
    productsByBrandId.get(brandId)!.push(created)
  }
  for (const [brandId, ps] of productsByBrandId) {
    await linkProductsToBrand(container, ps, brandId)
  }

  // 5d. Force-patch garment_images on created variants.
  // When Medusa restores a soft-deleted product (same handle), it keeps the
  // original variants and their old metadata, ignoring the new payload.
  // Querying by SKU and patching any variant missing garment_images ensures
  // the metadata is always correct regardless of create vs restore path.
  {
    const garmentImagesBySku = new Map<string, { garment_images: any; garment_color: string }>()
    for (const payload of toCreate) {
      for (const v of payload.variants ?? []) {
        if (v.sku && v.metadata?.garment_images) {
          garmentImagesBySku.set(v.sku, {
            garment_images: v.metadata.garment_images,
            garment_color: v.metadata.garment_color,
          })
        }
      }
    }

    if (garmentImagesBySku.size > 0) {
      const productModuleService = container.resolve(Modules.PRODUCT) as any
      if (typeof productModuleService.updateProductVariants === "function") {
        const skus = Array.from(garmentImagesBySku.keys())
        const { data: dbVariants } = await query.graph({
          entity: "product_variant",
          fields: ["id", "sku", "metadata"],
          filters: { sku: skus },
        })
        let patchCount = 0
        for (const dbv of dbVariants ?? []) {
          const sku = (dbv as any).sku as string
          const patch = garmentImagesBySku.get(sku)
          if (!patch) continue
          const existingMeta = ((dbv as any).metadata ?? {}) as Record<string, any>
          if (existingMeta.garment_images?.front) continue
          await productModuleService.updateProductVariants((dbv as any).id, {
            metadata: { ...existingMeta, ...patch },
          })
          patchCount++
        }
        if (patchCount > 0) {
          logger.info(`Patched garment_images on ${patchCount} restored variant(s).`)
        }
      }
    }
  }

  // 5g. Update existing products (IMPORT_UPDATE_EXISTING path). Picks up
  // corrected titles / descriptions / images, new colour variants
  // FashionBiz added since the last import, and price changes. Doesn't
  // re-run taxonomy or category assignment on existing products —
  // alias-map improvements stay opt-in via backfill-product-taxonomy.ts,
  // which is the explicit way to redo classification without touching
  // staff-curated tags.
  if (toUpdate.size) {
    const { summary } = await applyProductUpdates({
      container,
      desired: toUpdate,
      existing: existingByHandle,
      supplierMetaKey: "fashionbiz",
      logger,
    })
    logger.info(
      `Update summary: ${summary.productsUpdated} product(s) touched (${summary.productsUnchanged} unchanged), ${summary.variantsAdded} new variant(s), ${summary.variantsUpdated} variant patches, ${summary.errors} error(s).`
    )
  }

  // 6. Seed inventory levels at the FashionBiz Warehouse — only for newly
  // created products. Updates rely on the daily sync-fashionbiz-inventory
  // cron to pick up stock levels for the variants the diff helper added.
  if (!createdProducts.length) {
    logger.info("FashionBiz API import complete.")
    return
  }
  if (!locationId) {
    logger.warn("FashionBiz stock location missing; skipping inventory seed.")
    return
  }

  // Build a stock map by calling /stock for every (brand, slug, colour) tuple.
  const stockBySku = new Map<string, number>()
  const productByHandle = new Map<string, CreatedProductContext>()
  for (const ctx of created) productByHandle.set(ctx.productPayload.handle, ctx)
  for (const p of createdProducts) {
    const ctx = productByHandle.get(p.handle)
    if (!ctx) continue
    for (const colourName of ctx.colourNames) {
      try {
        const stockResp = await fashionbiz.fetchStock(ctx.brand, ctx.slug, colourName)
        for (const item of stockResp.items ?? []) {
          if (!item.sku) continue
          const total = (item.stock ?? []).reduce((a, s) => a + (s.qtyAvailable ?? 0), 0)
          stockBySku.set(item.sku, total)
        }
      } catch (err: any) {
        logger.warn(
          `Stock fetch failed for ${ctx.brand}/${ctx.slug}/${colourName}: ${err?.message ?? err}`
        )
      }
      await sleep(200)
    }
  }

  if (stockBySku.size === 0) {
    logger.info("No stock data returned — leaving inventory levels at zero.")
    logger.info("FashionBiz API import complete.")
    return
  }

  await seedInventoryLevels(container, { stockBySku, locationId, logger })

  logger.info("FashionBiz API import complete.")
}
