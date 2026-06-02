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
import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import {
  AsColourImage,
  AsColourProduct,
  AsColourVariant,
} from "../modules/ascolour/types"
import { buildPriceLadder } from "../modules/ascolour/pricing"
import {
  ladderToTierMinor,
  tierMinorToPriceSetRows,
  tierMinorToBulkPricingMetadata,
} from "../utils/bulk-tier-prices"
import { BRAND_MODULE } from "../modules/brand"
import { classifyAsColourProduct } from "../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
  seedInventoryLevels,
} from "../lib/supplier-import-pipeline"
import { slugify, titleCase } from "../utils/string-case"
import { parseGsm } from "../utils/parse-gsm"

const PRICE_CURRENCY_CODE = "aud"
// AS Colour brand identity — single source of truth via the Brand entity
// (per the brands convention in CLAUDE.md). external_code keeps the brand
// identifiable across importers (spreadsheet sync resolves by name OR
// external_code, case-insensitive).
const AS_COLOUR_BRAND_NAME = "AS Colour"
const AS_COLOUR_BRAND_HANDLE = "as-colour"
const AS_COLOUR_BRAND_EXTERNAL_CODE = "ASCOLOUR"
const AS_COLOUR_LOCATION_NAME = "AS Colour Warehouse"

const handleForStyle = (style: AsColourProduct) => {
  const name = style.productName ?? style.styleCode ?? "as-colour-product"
  return `as-colour-${slugify(`${name}-${style.styleCode}`)}`
}

type EnrichedStyle = {
  product: AsColourProduct
  variants: AsColourVariant[]
  images: AsColourImage[]
}

const extractArray = <T,>(resp: any): T[] => {
  if (!resp) return []
  if (Array.isArray(resp)) return resp as T[]
  return resp.items ?? resp.data ?? resp.results ?? []
}

export default async function importAsColourFromApi({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ascolour = container.resolve(ASCOLOUR_MODULE) as AsColourService

  // medusa exec swallows --flag-style args via its own yargs parser, so the
  // canonical way to pass options to scripts is environment variables. Old
  // --dry-run / --limit=N args are still honoured when they reach `args`.
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

  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as any
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const inventoryService = container.resolve(Modules.INVENTORY) as any
  const productService = container.resolve(Modules.PRODUCT) as any

  // Resolve common dependencies
  const salesChannels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannels.length) throw new Error("Default Sales Channel not found")
  const defaultSalesChannelId = salesChannels[0].id

  const shippingProfiles = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!shippingProfiles.length) throw new Error("Default shipping profile not found")
  const shippingProfileId = shippingProfiles[0].id

  // Stock location for AS Colour-managed stock
  let asColourLocationId: string | null = null
  const existingLocations = await stockLocationService.listStockLocations({
    name: AS_COLOUR_LOCATION_NAME,
  })
  if (existingLocations.length) {
    asColourLocationId = existingLocations[0].id
  } else if (!dryRun) {
    const created = await stockLocationService.createStockLocations({
      name: AS_COLOUR_LOCATION_NAME,
    })
    asColourLocationId = Array.isArray(created) ? created[0].id : created.id
    logger.info(`Created stock location ${AS_COLOUR_LOCATION_NAME} (${asColourLocationId})`)
  }

  // Ensure the stock location is linked to all sales channels — without this
  // the storefront returns variant.inventory_quantity = 0 for AS Colour
  // variants (stock exists at the location, but the channel can't see it).
  // Idempotent — Medusa's workflow no-ops when the link already exists.
  if (asColourLocationId && !dryRun) {
    const allChannels = (await salesChannelService.listSalesChannels(
      {},
      { take: 500 }
    )) as Array<{ id: string }>
    const channelIds = allChannels.map((c) => c.id)
    if (channelIds.length > 0) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: asColourLocationId, add: channelIds },
      })
      logger.info(
        `Linked ${channelIds.length} sales channel(s) to ${AS_COLOUR_LOCATION_NAME}`
      )
    }
  }

  // 1. Fetch catalogue + price list
  logger.info("Fetching AS Colour catalogue...")
  let products = await ascolour.fetchAllProducts()

  // AS Colour appends "S" to a styleCode to mark it as superseded/
  // discontinued (verified empirically 2026-05-17 via
  // probe-ascolour-product-shape.ts: 141/629 styles end in "S" and
  // 75 of them have a paired non-S base still in the catalog — the
  // characteristic "current ↔ superseded" pattern). Skip them.
  //
  // Set IMPORT_INCLUDE_DISCONTINUED=1 to bypass this filter (e.g. for
  // historical analysis or to import a specific S-suffix style by hand).
  const skipDiscontinued =
    process.env.IMPORT_INCLUDE_DISCONTINUED !== "1" &&
    process.env.IMPORT_INCLUDE_DISCONTINUED !== "true"
  let skippedDiscontinued = 0
  if (skipDiscontinued) {
    const before = products.length
    products = products.filter((p) => {
      if (/S$/.test(String(p.styleCode ?? ""))) {
        skippedDiscontinued++
        return false
      }
      return true
    })
    logger.info(
      `Filtered out ${before - products.length} discontinued style(s) (styleCode ending in "S"). Set IMPORT_INCLUDE_DISCONTINUED=1 to bypass.`
    )
  }

  if (limit) products = products.slice(0, limit)
  logger.info(`Got ${products.length} products from AS Colour.`)

  logger.info("Fetching AS Colour price list (trade prices)...")
  const priceList = await ascolour.fetchAllPriceList()
  const costBySku = new Map<string, number>()
  for (const entry of priceList) {
    const price = Number(entry.price)
    if (!entry.sku || !Number.isFinite(price)) continue
    // As of 2026-05-15 AS Colour's /catalog/pricelist returns exactly one
    // row per SKU (verified via probe-ascolour-pricelist.ts: 10,784 rows,
    // 10,784 unique SKUs). The max-vs-prev check is order-independent
    // insurance in case they ever switch to multiple rows per SKU (e.g.
    // quantity-break tiers) — the 1-pack tier would then always be the
    // most expensive, which is the price SC Prints actually pays for
    // single units. If you see multiple rows per SKU in the wild, run
    // the probe again and confirm before relying on this branch.
    const prev = costBySku.get(entry.sku)
    if (prev === undefined || price > prev) {
      costBySku.set(entry.sku, price)
    }
  }
  logger.info(`Got ${costBySku.size} price-list entries.`)

  // 2. Enrich each style with variants + images (sequential to be polite to
  // the API). ALWAYS hit fetchAllProductVariants — the catalog endpoint can
  // return a truncated inline `variants` array, and the per-product endpoint
  // paginates at 250. Trusting either of those silently dropped 320 variants
  // off Staple Tee 5001 in the original import (see backfill-ascolour-variants).
  const enriched: EnrichedStyle[] = []
  for (const product of products) {
    try {
      const variants = await ascolour.fetchAllProductVariants(product.styleCode)
      const images =
        product.images?.length
          ? product.images
          : extractArray<AsColourImage>(await ascolour.getClient().getProductImages(product.styleCode))
      enriched.push({ product, variants, images })
    } catch (err: any) {
      logger.warn(`Failed to enrich style ${product.styleCode}: ${err?.message ?? err}`)
    }
  }

  // 3. Determine which styles already exist (idempotency by handle)
  const targetHandles = enriched.map(({ product }) => handleForStyle(product))
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: targetHandles },
  })
  const existingByHandle = new Map<string, string>(
    (existing ?? []).map((p: any) => [p.handle, p.id])
  )

  // 3b. Resolve (or create) the AS Colour Brand entity. Brand is the
  // single source of truth for brand identity (see CLAUDE.md "Brands");
  // we link products to it after creation, NOT via product tags or
  // metadata.
  const brandService = container.resolve(BRAND_MODULE) as any
  const existingBrands = await brandService.listBrands({})
  let asColourBrand = (existingBrands as any[]).find(
    (b) =>
      (b.external_code ?? "").toUpperCase() === AS_COLOUR_BRAND_EXTERNAL_CODE ||
      (b.handle ?? "").toLowerCase() === AS_COLOUR_BRAND_HANDLE ||
      (b.name ?? "").toLowerCase() === AS_COLOUR_BRAND_NAME.toLowerCase()
  )
  if (!asColourBrand && !dryRun) {
    const [created] = await brandService.createBrands([
      {
        name: AS_COLOUR_BRAND_NAME,
        handle: AS_COLOUR_BRAND_HANDLE,
        external_code: AS_COLOUR_BRAND_EXTERNAL_CODE,
        is_active: true,
      },
    ])
    asColourBrand = created
    logger.info(`Created brand "${AS_COLOUR_BRAND_NAME}" (${asColourBrand.id}).`)
  } else if (!asColourBrand && dryRun) {
    logger.info(
      `[DRY] Would create brand "${AS_COLOUR_BRAND_NAME}" (handle ${AS_COLOUR_BRAND_HANDLE}, external_code ${AS_COLOUR_BRAND_EXTERNAL_CODE}).`
    )
  } else {
    logger.info(`Reusing existing brand "${asColourBrand.name}" (${asColourBrand.id}).`)
  }

  // 4. Build product create payloads
  const toCreate: any[] = []
  const skuToInventory: { sku: string; styleCode: string }[] = []
  const handleToAsColourProduct = new Map<string, AsColourProduct>()

  for (const { product, variants, images } of enriched) {
    const handle = handleForStyle(product)
    if (existingByHandle.has(handle)) {
      logger.info(`Skipping existing handle ${handle} (id ${existingByHandle.get(handle)})`)
      continue
    }

    // Field names per the real AS Colour API shape (see probe-ascolour-product.ts):
    //   variant: { sku, styleCode, name, colour, sizeCode, weight, imageUrl, GTIN12, ... }
    //   image:   { styleCode, imageType, urlStandard, urlThumbnail, urlTiny, urlZoom }
    //   product: { styleCode, styleName, description, composition, productType, productWeight, ... }
    const sizes = new Set<string>()
    const colours = new Set<string>()
    for (const v of variants as any[]) {
      if (v.sizeCode) sizes.add(v.sizeCode)
      if (v.colour) colours.add(v.colour)
    }
    const hasSize = sizes.size > 1 || (sizes.size === 1 && !sizes.has("OS"))
    const hasColour = colours.size > 0

    const options: { title: string; values: string[] }[] = []
    if (hasColour) options.push({ title: "Colour", values: Array.from(colours) })
    if (hasSize) options.push({ title: "Size", values: Array.from(sizes) })
    if (!options.length) options.push({ title: "Default", values: ["Default"] })

    const productImages: { url: string }[] = []
    const seen = new Set<string>()
    for (const img of images as any[]) {
      // AS Colour returns four sizes per image: urlZoom (~1280px),
      // urlStandard (~386px), urlThumbnail (~220px), urlTiny (~44px).
      // Prefer urlZoom — the storefront PDP hero renders at ~50vw (often
      // 512–960px on desktop, more on retina), and urlStandard is below
      // that on most viewports so Next.js downsamples a too-small source
      // and the image looks soft.
      const url = img.urlZoom || img.urlStandard || img.urlThumbnail || img.urlTiny
      if (url && !seen.has(url)) {
        seen.add(url)
        productImages.push({ url })
      }
    }
    const thumbnail = productImages[0]?.url

    // AS Colour exposes GSM via `fabricWeight` on the product object
    // (e.g. "320 GSM"). Falls back to `composition` which often embeds it
    // ("Heavy weight, 320 GSM, 100% cotton canvas"). parseGsm returns null
    // for purely qualitative strings so only numeric values land in metadata.
    const gsm =
      parseGsm((product as any).fabricWeight) ??
      parseGsm((product as any).composition)

    const productVariants = (variants as any[]).map((v) => {
      const variantOptions: Record<string, string> = {}
      if (hasColour && v.colour) variantOptions["Colour"] = v.colour
      if (hasSize && v.sizeCode) variantOptions["Size"] = v.sizeCode
      if (!hasColour && !hasSize) variantOptions["Default"] = "Default"

      const cost = costBySku.get(v.sku)
      const ladder = cost !== undefined ? buildPriceLadder(cost) : null
      const tierMinor = ladder ? ladderToTierMinor(ladder) : null

      const titleParts = [v.colour, v.sizeCode].filter(Boolean)
      const variantTitle = titleParts.join(" / ") || v.name || v.sku

      // AS Colour `weight` on variants is a string (e.g. "320 GSM" / "Heavy
      // Weight"), not a number. Skip — Medusa expects grams as a number.
      const weight = undefined

      if (cost !== undefined) {
        skuToInventory.push({ sku: v.sku, styleCode: product.styleCode })
      }

      // Build the 5-tier price-set rows (qty bands 1-9 / 10-19 / 20-49 /
      // 50-99 / 100+). Without these, Medusa's pricing module only knows
      // one price and `calculated_amount` ignores cart quantity — see
      // utils/bulk-tier-prices.ts for the shared helper used here, also
      // called by the spreadsheet sync apply-variant-tier-prices route.
      // When `cost` is unknown (SKU missing from AS Colour pricelist) we
      // fall back to a zero-price single row so the variant still creates;
      // the operator can fix pricing manually in admin afterwards.
      const prices = tierMinor
        ? tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE)
        : [{ amount: 0, currency_code: PRICE_CURRENCY_CODE }]

      return {
        title: variantTitle,
        sku: v.sku,
        barcode: v.GTIN12 ?? undefined,
        weight,
        manage_inventory: true,
        allow_backorder: false,
        options: variantOptions,
        prices,
        metadata: {
          ascolour: {
            styleCode: product.styleCode,
            sku: v.sku,
            colour: v.colour,
            sizeCode: v.sizeCode,
          },
          // Storefront reads `metadata.bulk_pricing.tiers` (array of
          // {min_quantity, max_quantity, amount}) — same shape the
          // spreadsheet path writes via apply-variant-tier-prices.
          ...(tierMinor
            ? { bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, "ascolour-api") }
            : {}),
          // Canonical ex-GST cost in minor units — read by the tier-pricing
          // regen job. See `backend/src/lib/customer-tiers.ts`.
          ...(cost !== undefined
            ? { cost_price_ex_gst_minor: Math.round(cost * 100) }
            : {}),
        },
      }
    })

    // AS Colour `styleName` often comes through as "Parcel Tote | 1000" —
    // strip the trailing "| <code>" if present so titles read naturally.
    const rawStyleName = (product as any).styleName ?? ""
    const cleanedName = rawStyleName.replace(/\s*\|\s*\d+[A-Z]*\s*$/, "").trim()
    const title = cleanedName
      ? titleCase(cleanedName)
      : `AS Colour ${product.styleCode}`

    handleToAsColourProduct.set(handle, product)
    toCreate.push({
      title,
      handle,
      status: ProductStatus.PUBLISHED,
      description: (product as any).description ?? undefined,
      thumbnail,
      // AS Colour's `productWeight` is a string ("Heavy Weight"), not grams — skip.
      material: (product as any).composition ?? undefined,
      images: productImages,
      options,
      variants: productVariants,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
      // Brand identity comes from the linked Brand entity (see CLAUDE.md
      // "Brands"). No product tag for brand — we link below after create.
      metadata: {
        source: "ascolour",
        ...(gsm !== null ? { gsm } : {}),
        ascolour: {
          styleCode: product.styleCode,
          lastSync: new Date().toISOString(),
          productType: (product as any).productType ?? null,
          category: product.category ?? null,
          gender: (product as any).gender ?? null,
          fit: (product as any).fit ?? null,
        },
      },
    })
  }

  logger.info(`Prepared ${toCreate.length} products for creation.`)
  if (dryRun) {
    logger.info("Dry run — skipping createProductsWorkflow + inventory seed.")
    return
  }
  if (!toCreate.length) {
    logger.info("Nothing to create.")
    return
  }

  // 5. Create products
  const { result } = await createProductsWorkflow(container).run({
    input: { products: toCreate },
  })
  const createdProducts = (result as any[]) ?? []
  logger.info(`Created ${createdProducts.length} products.`)

  // 5b. Assign product_type + demographic tags via the shared taxonomy
  // pipeline. CLAUDE.md "Types & tags convention" mandates this for every
  // supplier importer; runs the AS Colour classifier and the title-fallback
  // pass that covers the API's frequently-null productType/gender/fit fields.
  await applyTaxonomyToProducts(container, {
    products: createdProducts,
    sourceByHandle: handleToAsColourProduct,
    classify: classifyAsColourProduct,
    logger,
    // AS Colour's catalog is unisex unless explicitly gendered. Hands this
    // hint to applyTitleFallbacks so apparel without a gender field gets
    // tagged Unisex after title inference fails (Polos, Tees, Hoodies, ...).
    brandHandle: "as-colour",
  })

  // 5c. Shop categories — surface in the menu drill-down.
  await applyShopCategoriesToProducts(container, createdProducts, logger)

  // 5d. Link each new product to the AS Colour Brand entity. Idempotent —
  // re-runs of the script silently skip already-linked products.
  if (asColourBrand && createdProducts.length) {
    await linkProductsToBrand(container, createdProducts, asColourBrand.id)
  }

  // 6. Seed initial inventory at the AS Colour location
  if (!asColourLocationId) {
    logger.warn("AS Colour stock location not available; skipping inventory seed.")
    return
  }

  logger.info("Seeding initial inventory levels...")
  const allInventory = await ascolour.fetchInventoryDelta()
  // AS Colour's real /inventory/items response is one row per (sku, location)
  // with the qty in `quantity` (not `available`) and no `warehouses` array.
  // Sum across rows so multi-warehouse SKUs aggregate correctly. Fall back
  // to the legacy nested shape if the API ever returns it.
  const importedSkus = new Set(skuToInventory.map((s) => s.sku))
  const stockBySku = new Map<string, number>()
  for (const item of allInventory as any[]) {
    if (!item?.sku || !importedSkus.has(item.sku)) continue
    const qty =
      typeof item.quantity === "number"
        ? item.quantity
        : item.warehouses?.length
          ? item.warehouses.reduce((a: number, w: any) => a + (w.available ?? 0), 0)
          : (item.available ?? 0)
    stockBySku.set(item.sku, (stockBySku.get(item.sku) ?? 0) + qty)
  }
  logger.info(
    `Parsed stock for ${stockBySku.size} unique SKUs from ${allInventory.length} inventory rows.`
  )

  await seedInventoryLevels(container, {
    stockBySku,
    locationId: asColourLocationId,
    logger,
  })

  logger.info("AS Colour API import complete.")
}
