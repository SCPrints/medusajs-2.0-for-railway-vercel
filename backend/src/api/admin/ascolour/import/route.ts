import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { ASCOLOUR_MODULE } from "../../../../modules/ascolour"
import AsColourService from "../../../../modules/ascolour/service"
import {
  AsColourImage,
  AsColourProduct,
  AsColourVariant,
} from "../../../../modules/ascolour/types"
import { buildPriceLadder } from "../../../../modules/ascolour/pricing"
import {
  ladderToTierMinor,
  tierMinorToPriceSetRows,
  tierMinorToBulkPricingMetadata,
} from "../../../../utils/bulk-tier-prices"
import { BRAND_MODULE } from "../../../../modules/brand"
import { classifyAsColourProduct } from "../../../../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
  seedInventoryLevels,
} from "../../../../lib/supplier-import-pipeline"
import { slugify, titleCase } from "../../../../utils/string-case"

const PRICE_CURRENCY_CODE = "aud"
const AS_COLOUR_BRAND_HANDLE = "as-colour"
const AS_COLOUR_BRAND_NAME = "AS Colour"
const AS_COLOUR_BRAND_EXTERNAL_CODE = "ASCOLOUR"
const AS_COLOUR_LOCATION_NAME = "AS Colour Warehouse"

const handleForStyle = (styleCode: string, productName?: string) => {
  const name = productName ?? styleCode
  return `as-colour-${slugify(`${name}-${styleCode}`)}`
}

const extractArray = <T,>(resp: any): T[] => {
  if (!resp) return []
  if (Array.isArray(resp)) return resp as T[]
  return resp.items ?? resp.data ?? resp.results ?? []
}

/**
 * POST /admin/ascolour/import
 *
 * Imports selected AS Colour products into Medusa. Mirrors the
 * `import-as-colour-from-api` script scoped to the requested styleCodes.
 *
 * Body: { styleCodes: string[] }
 * Returns: { imported: string[], skipped: string[], errors: Array<{ styleCode, error }> }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let ascolour: AsColourService
  try {
    ascolour = req.scope.resolve(ASCOLOUR_MODULE) as AsColourService
  } catch {
    return res.status(503).json({ error: "AS Colour module not configured." })
  }

  const body = req.body as { styleCodes?: string[] }
  const styleCodes = body.styleCodes

  if (!styleCodes?.length) {
    return res.status(400).json({ error: "body must contain styleCodes[]" })
  }

  const salesChannelService = req.scope.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT) as any
  const stockLocationService = req.scope.resolve(Modules.STOCK_LOCATION) as any
  const brandService = req.scope.resolve(BRAND_MODULE) as any
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any

  const salesChannels = await salesChannelService.listSalesChannels({ name: "Default Sales Channel" })
  if (!salesChannels.length) return res.status(500).json({ error: "Default Sales Channel not found" })
  const defaultSalesChannelId = salesChannels[0].id

  const shippingProfiles = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!shippingProfiles.length) return res.status(500).json({ error: "Default shipping profile not found" })
  const shippingProfileId = shippingProfiles[0].id

  // Resolve or create AS Colour Warehouse stock location
  let locationId: string | null = null
  const existingLocations = await stockLocationService.listStockLocations({ name: AS_COLOUR_LOCATION_NAME })
  if (existingLocations.length) {
    locationId = existingLocations[0].id
  } else {
    const created = await stockLocationService.createStockLocations({ name: AS_COLOUR_LOCATION_NAME })
    locationId = Array.isArray(created) ? created[0].id : created.id
  }

  // Link the stock location to every sales channel — without this the
  // storefront returns variant.inventory_quantity = 0 for AS Colour
  // variants (stock exists at the location, but the channel can't see it).
  // Idempotent; already-linked channels are fine.
  if (locationId) {
    const allChannels = (await salesChannelService.listSalesChannels(
      {},
      { take: 500 }
    )) as Array<{ id: string }>
    const channelIds = allChannels.map((c) => c.id)
    if (channelIds.length > 0) {
      try {
        await linkSalesChannelsToStockLocationWorkflow(req.scope).run({
          input: { id: locationId, add: channelIds },
        })
      } catch {
        // Idempotent — already-linked channels are fine.
      }
    }
  }

  // Resolve or create the AS Colour Brand entity
  const existingBrands = (await brandService.listBrands({})) as any[]
  let asColourBrand = existingBrands.find(
    (b) =>
      (b.external_code ?? "").toUpperCase() === AS_COLOUR_BRAND_EXTERNAL_CODE ||
      (b.handle ?? "").toLowerCase() === AS_COLOUR_BRAND_HANDLE ||
      (b.name ?? "").toLowerCase() === AS_COLOUR_BRAND_NAME.toLowerCase()
  )
  if (!asColourBrand) {
    const [created] = await brandService.createBrands([{
      name: AS_COLOUR_BRAND_NAME,
      handle: AS_COLOUR_BRAND_HANDLE,
      external_code: AS_COLOUR_BRAND_EXTERNAL_CODE,
      is_active: true,
    }])
    asColourBrand = created
  }

  // Fetch all products from AS Colour to find the requested styleCodes,
  // then enrich with variants + images
  const allProducts = await ascolour.fetchAllProducts()
  const productsByCode = new Map(allProducts.map((p) => [p.styleCode, p]))

  // Fetch price list
  const priceList = await ascolour.fetchAllPriceList()
  const costBySku = new Map<string, number>()
  for (const entry of priceList) {
    const price = Number(entry.price)
    if (entry.sku && Number.isFinite(price)) costBySku.set(entry.sku, price)
  }

  const imported: string[] = []
  const skipped: string[] = []
  const errors: Array<{ styleCode: string; error: string }> = []

  const toCreate: any[] = []
  const skuToInventory: { sku: string }[] = []
  type Context = { styleCode: string }
  const contexts: Context[] = []

  for (const styleCode of styleCodes) {
    try {
      // Refuse styleCodes ending in "S" even if a stale UI ticks them. AS
      // Colour uses the trailing S to mark superseded/discontinued styles
      // (verified empirically — 75 of 141 S-suffix styles have a paired
      // non-S base still in the catalog, the characteristic "current ↔
      // superseded" pattern). Server-side check so it can't be bypassed by
      // direct API calls. Same regex as in the catalog filter — keep in sync.
      if (/S$/.test(styleCode)) {
        errors.push({
          styleCode,
          error: "Skipped: styleCode ends in 'S' (AS Colour's convention for superseded/discontinued styles)",
        })
        continue
      }

      const product = productsByCode.get(styleCode)
      if (!product) {
        errors.push({ styleCode, error: "Product not found in AS Colour catalog" })
        continue
      }

      const handle = handleForStyle(styleCode, (product as any).productName)

      // Idempotency: skip if already imported
      const { data: existing } = await query.graph({
        entity: "product",
        fields: ["id"],
        filters: { handle: [handle] },
      })
      if ((existing ?? []).length > 0) {
        skipped.push(styleCode)
        continue
      }

      // Enrich with variants + images
      const variants: AsColourVariant[] = product.variants?.length
        ? product.variants
        : extractArray<AsColourVariant>(await ascolour.getClient().getProductVariants(styleCode))
      const images: AsColourImage[] = product.images?.length
        ? product.images
        : extractArray<AsColourImage>(await ascolour.getClient().getProductImages(styleCode))

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
        // Prefer urlZoom (~1280px) over urlStandard (~386px); see
        // import-as-colour-from-api.ts for the rationale. Keep in sync.
        const url = img.urlZoom || img.urlStandard || img.urlThumbnail || img.urlTiny
        if (url && !seen.has(url)) {
          seen.add(url)
          productImages.push({ url })
        }
      }

      const productVariants = (variants as any[]).map((v) => {
        const variantOptions: Record<string, string> = {}
        if (hasColour && v.colour) variantOptions["Colour"] = v.colour
        if (hasSize && v.sizeCode) variantOptions["Size"] = v.sizeCode
        if (!hasColour && !hasSize) variantOptions["Default"] = "Default"

        const cost = costBySku.get(v.sku)
        const ladder = cost !== undefined ? buildPriceLadder(cost) : null
        const tierMinor = ladder ? ladderToTierMinor(ladder) : null

        if (cost !== undefined) skuToInventory.push({ sku: v.sku })

        const prices = tierMinor
          ? tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE)
          : [{ amount: 0, currency_code: PRICE_CURRENCY_CODE }]

        return {
          title: [v.colour, v.sizeCode].filter(Boolean).join(" / ") || v.name || v.sku,
          sku: v.sku,
          barcode: v.GTIN12 ?? undefined,
          manage_inventory: true,
          allow_backorder: false,
          options: variantOptions,
          prices,
          metadata: {
            ascolour: { styleCode, sku: v.sku, colour: v.colour, sizeCode: v.sizeCode },
            ...(tierMinor
              ? { bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, "ascolour-api") }
              : {}),
          },
        }
      })

      const rawStyleName = (product as any).styleName ?? ""
      const cleanedName = rawStyleName.replace(/\s*\|\s*\d+[A-Z]*\s*$/, "").trim()
      const title = cleanedName ? titleCase(cleanedName) : `AS Colour ${styleCode}`

      toCreate.push({
        title,
        handle,
        status: ProductStatus.PUBLISHED,
        description: (product as any).description ?? undefined,
        thumbnail: productImages[0]?.url,
        material: (product as any).composition ?? undefined,
        images: productImages,
        options,
        variants: productVariants,
        shipping_profile_id: shippingProfileId,
        sales_channels: [{ id: defaultSalesChannelId }],
        metadata: {
          source: "ascolour",
          ascolour: { styleCode, lastSync: new Date().toISOString() },
        },
      })

      contexts.push({ styleCode })
    } catch (err: any) {
      errors.push({ styleCode, error: err?.message ?? String(err) })
    }
  }

  if (!toCreate.length) {
    return res.json({ imported, skipped, errors })
  }

  // Create products
  const { result } = await createProductsWorkflow(req.scope).run({
    input: { products: toCreate },
  })
  const createdProducts = (result as any[]) ?? []

  if (asColourBrand) {
    await linkProductsToBrand(req.scope, createdProducts, asColourBrand.id)
  }

  // Build handle → source-product map for taxonomy classification. The
  // styleCode round-trips through metadata.ascolour.styleCode so we can
  // pair createProductsWorkflow's output back to the original API record.
  const sourceByHandle = new Map<string, AsColourProduct>()
  for (const p of createdProducts) {
    const styleCode = (p as any).metadata?.ascolour?.styleCode
    const asColourProduct = styleCode ? productsByCode.get(styleCode) : undefined
    if (asColourProduct) sourceByHandle.set((p as any).handle, asColourProduct)
  }

  await applyTaxonomyToProducts(req.scope, {
    products: createdProducts,
    sourceByHandle,
    classify: classifyAsColourProduct,
    logger,
  })

  await applyShopCategoriesToProducts(req.scope, createdProducts, logger)

  for (const ctx of contexts) {
    imported.push(ctx.styleCode)
  }

  // Seed inventory at the AS Colour Warehouse. Restricted to the SKUs we
  // just imported so we don't accidentally stamp 0 quantities on unrelated
  // products that share the AS Colour inventory feed.
  if (locationId && skuToInventory.length > 0) {
    const allInventory = await ascolour.fetchInventoryDelta()
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
    await seedInventoryLevels(req.scope, { stockBySku, locationId, logger })
  }

  return res.json({ imported, skipped, errors })
}
