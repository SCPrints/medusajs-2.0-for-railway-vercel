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
import { AUSSIEPACIFIC_MODULE } from "../../../../modules/aussiepacific"
import AussiePacificService from "../../../../modules/aussiepacific/service"
import {
  AussiePacificProduct,
  AussiePacificVariant,
} from "../../../../modules/aussiepacific/types"
import { priceLadderFromAussiePacific } from "../../../../modules/aussiepacific/pricing"
import {
  buildGarmentImagesForVariant,
  collectImageUrls,
  handleForProduct,
  imageUrl,
  normalizeStockLevel,
  titleCase,
  toArray,
} from "../../../../modules/aussiepacific/mapping"
import {
  ladderToTierMinor,
  tierMinorToPriceSetRows,
  tierMinorToBulkPricingMetadata,
} from "../../../../utils/bulk-tier-prices"
import type { PriceLadder } from "../../../../utils/bulk-price-ladder"
import { BRAND_MODULE } from "../../../../modules/brand"
import { classifyAussiePacificProduct } from "../../../../lib/product-taxonomy"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
  seedInventoryLevels,
} from "../../../../lib/supplier-import-pipeline"

const PRICE_CURRENCY_CODE = "aud"
const AUSSIEPACIFIC_LOCATION_NAME = "Aussie Pacific Warehouse"
const AUSSIEPACIFIC_BRAND_HANDLE = "aussie-pacific"

type VariantLadderResult = {
  ladder: PriceLadder
  cost: number
  tierMinor: ReturnType<typeof ladderToTierMinor>
}

/**
 * POST /admin/aussie-pacific/import
 *
 * Imports selected AP products into Medusa. Same logic as the
 * import-aussie-pacific-from-api script but scoped to the provided
 * style codes.
 *
 * Body: { style_codes: string[] }
 * Returns: { imported: string[], skipped: string[], errors: Array<{ style_code, error }> }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  let ap: AussiePacificService
  try {
    ap = req.scope.resolve(AUSSIEPACIFIC_MODULE) as AussiePacificService
  } catch {
    return res.status(503).json({
      error:
        "Aussie Pacific module not configured. Set AUSSIE_PACIFIC_API_TOKEN.",
    })
  }

  const body = req.body as { style_codes?: string[] }
  const styleCodes = (body.style_codes ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)

  if (!styleCodes.length) {
    return res
      .status(400)
      .json({ error: "body must contain style_codes[]" })
  }

  const costAdjustment = ap.getCostAdjustment()

  const salesChannelService = req.scope.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT) as any
  const stockLocationService = req.scope.resolve(Modules.STOCK_LOCATION) as any
  const brandService = req.scope.resolve(BRAND_MODULE) as any
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any

  const salesChannels = await salesChannelService.listSalesChannels({
    name: "Default Sales Channel",
  })
  if (!salesChannels.length) {
    return res.status(500).json({ error: "Default Sales Channel not found" })
  }
  const defaultSalesChannelId = salesChannels[0].id

  const shippingProfiles = await fulfillmentService.listShippingProfiles({
    type: "default",
  })
  if (!shippingProfiles.length) {
    return res.status(500).json({ error: "Default shipping profile not found" })
  }
  const shippingProfileId = shippingProfiles[0].id

  // Resolve or create the Aussie Pacific Warehouse stock location
  let locationId: string | null = null
  const existingLocations = await stockLocationService.listStockLocations({
    name: AUSSIEPACIFIC_LOCATION_NAME,
  })
  if (existingLocations.length) {
    locationId = existingLocations[0].id
  } else {
    const created = await stockLocationService.createStockLocations({
      name: AUSSIEPACIFIC_LOCATION_NAME,
    })
    locationId = Array.isArray(created) ? created[0].id : created.id
  }

  // Link the stock location to all sales channels (idempotent).
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

  // Resolve the AP brand entity (pre-seeded by the brand migration).
  const allBrands = (await brandService.listBrands({})) as Array<{
    id: string
    handle: string
  }>
  const apBrand = allBrands.find(
    (b) => (b.handle ?? "").toLowerCase() === AUSSIEPACIFIC_BRAND_HANDLE
  )
  if (!apBrand) {
    return res.status(500).json({
      error: `Brand "${AUSSIEPACIFIC_BRAND_HANDLE}" missing. Run \`medusa exec migrate-products-to-brand-entity -- --apply\` first.`,
    })
  }

  const imported: string[] = []
  const skipped: string[] = []
  const errors: Array<{ style_code: string; error: string }> = []

  type ProductContext = {
    styleCode: string
    payload: any
    apProduct: AussiePacificProduct
    stockBySku: Map<string, number>
  }
  const contexts: ProductContext[] = []

  for (const styleCode of styleCodes) {
    try {
      const product = await ap.fetchProductByStyleCode(styleCode)
      if (!product) {
        errors.push({ style_code: styleCode, error: "Style not found in AP API" })
        continue
      }
      // Refuse run-out items even if a stale UI ticks them. The catalog
       // endpoint hides them by default; surfacing via include_discontinued
       // is for visibility only, not for actually importing them.
      if (product.run_out === true) {
        errors.push({
          style_code: styleCode,
          error: "Skipped: supplier has flagged this style as run-out stock",
        })
        continue
      }
      const handle = handleForProduct(styleCode)

      // Skip if already imported
      const { data: existing } = await query.graph({
        entity: "product",
        fields: ["id"],
        filters: { handle: [handle] },
      })
      if ((existing ?? []).length > 0) {
        skipped.push(styleCode)
        continue
      }

      const variants = toArray<AussiePacificVariant>(product.variants).filter(
        (v): v is AussiePacificVariant => !!v?.sku
      )
      if (!variants.length) {
        errors.push({ style_code: styleCode, error: "No variants returned" })
        continue
      }

      // Per-variant ladders.
      const ladderBySku = new Map<string, VariantLadderResult>()
      let cheapest: VariantLadderResult | null = null
      const stockBySku = new Map<string, number>()
      for (const v of variants) {
        const ladder = priceLadderFromAussiePacific(v.price, costAdjustment)
        if (!ladder) continue
        const cost = Number(v.price) * costAdjustment
        const tierMinor = ladderToTierMinor(ladder)
        const result: VariantLadderResult = { ladder, cost, tierMinor }
        ladderBySku.set(v.sku, result)
        if (!cheapest || cost < cheapest.cost) cheapest = result
        stockBySku.set(v.sku, normalizeStockLevel(v.stock_level))
      }
      if (!cheapest) {
        errors.push({
          style_code: styleCode,
          error: "No variant has a usable price",
        })
        continue
      }

      const colourSet = new Set<string>()
      const sizeSet = new Set<string>()
      for (const v of variants) {
        if (v.colour) colourSet.add(v.colour)
        if (v.size) sizeSet.add(v.size)
      }
      const hasColour = colourSet.size > 0
      const hasSize =
        sizeSet.size > 0 && !(sizeSet.size === 1 && sizeSet.has("OS"))

      const options: { title: string; values: string[] }[] = []
      if (hasColour) options.push({ title: "Colour", values: Array.from(colourSet) })
      if (hasSize) options.push({ title: "Size", values: Array.from(sizeSet) })
      if (!options.length) options.push({ title: "Default", values: ["Default"] })

      const productImages = collectImageUrls(product).map((url) => ({ url }))
      const thumbnail = productImages[0]?.url

      const productVariants: any[] = []
      const seenSkus = new Set<string>()
      for (const v of variants) {
        if (seenSkus.has(v.sku)) continue
        seenSkus.add(v.sku)
        const ladderResult = ladderBySku.get(v.sku)
        if (!ladderResult) continue

        const variantOptions: Record<string, string> = {}
        if (hasColour && v.colour) variantOptions["Colour"] = v.colour
        if (hasSize && v.size) variantOptions["Size"] = v.size
        if (!hasColour && !hasSize) variantOptions["Default"] = "Default"

        const titleParts = [v.colour, v.size].filter(Boolean)
        const variantTitle = (titleParts.join(" / ") as string) || v.sku

        productVariants.push({
          title: variantTitle,
          sku: v.sku,
          barcode: v.barcode || undefined,
          manage_inventory: true,
          allow_backorder: false,
          options: variantOptions,
          prices: tierMinorToPriceSetRows(
            ladderResult.tierMinor,
            PRICE_CURRENCY_CODE
          ),
          metadata: {
            aussiepacific: {
              style_code: product.style_code,
              sku: v.sku,
              colour: v.colour ?? null,
              size: v.size ?? null,
              barcode: v.barcode ?? null,
              api_price: v.price ?? null,
            },
            bulk_pricing: tierMinorToBulkPricingMetadata(
              ladderResult.tierMinor,
              "aussiepacific-api"
            ),
            cost_adjustment: costAdjustment,
            garment_images: buildGarmentImagesForVariant(v),
            garment_color: v.colour ?? null,
          },
        })
      }

      if (!productVariants.length) {
        errors.push({
          style_code: styleCode,
          error: "No variants after pricing",
        })
        continue
      }

      const title = product.name
        ? titleCase(product.name)
        : `Aussie Pacific ${product.style_code}`

      const payload: any = {
        title,
        handle,
        status: ProductStatus.PUBLISHED,
        description: product.description ?? "",
        thumbnail,
        images: productImages,
        options,
        variants: productVariants,
        shipping_profile_id: shippingProfileId,
        sales_channels: [{ id: defaultSalesChannelId }],
        metadata: {
          source: "aussiepacific",
          aussiepacific: {
            style_code: product.style_code,
            style: product.style,
            main_category: product.main_category,
            sub_category: product.sub_category,
            brand_label: product.brand,
            run_out: product.run_out ?? false,
            last_sync: new Date().toISOString(),
          },
          bulk_pricing: tierMinorToBulkPricingMetadata(
            cheapest.tierMinor,
            "aussiepacific-api"
          ),
        },
      }

      contexts.push({ styleCode, payload, apProduct: product, stockBySku })
    } catch (err: any) {
      errors.push({ style_code: styleCode, error: err?.message ?? String(err) })
    }
  }

  if (!contexts.length) {
    return res.json({ imported, skipped, errors })
  }

  // Create products
  const { result } = await createProductsWorkflow(req.scope).run({
    input: { products: contexts.map((c) => c.payload) },
  })
  const createdProducts = (result as any[]) ?? []

  await linkProductsToBrand(req.scope, createdProducts, apBrand.id)

  const apByHandle = new Map(
    contexts.map((c) => [c.payload.handle, c.apProduct])
  )
  await applyTaxonomyToProducts(req.scope, {
    products: createdProducts,
    sourceByHandle: apByHandle,
    classify: classifyAussiePacificProduct,
    logger,
  })

  await applyShopCategoriesToProducts(req.scope, createdProducts, logger)

  // Seed inventory at the AP warehouse. stockBySku was built per-context
  // during the product loop (AP returns stock embedded in the API call we
  // were already making), so we just need to flatten and upsert.
  if (locationId) {
    const stockBySku = new Map<string, number>()
    for (const ctx of contexts) {
      for (const [sku, qty] of ctx.stockBySku) stockBySku.set(sku, qty)
    }
    await seedInventoryLevels(req.scope, { stockBySku, locationId, logger })
  }

  for (const ctx of contexts) {
    imported.push(ctx.styleCode)
  }

  return res.json({ imported, skipped, errors })
}
