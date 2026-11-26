/**
 * Legend Life import — creates the given styles as DRAFT products. Used by
 * the CLI script (scripts/import-legendlife.ts) and the nightly supplier
 * catalogue sync (run.ts), so both build products the same way.
 *
 *   - Price: SC Prints' trade price for the smallest quantity band (price1 of
 *     /customer/stylePricingAndStock) × LEGENDLIFE_COST_ADJUSTMENT → the
 *     shared ladder. Ex-GST (confirmed 2026-11-26).
 *   - Stock: per-SKU "Total" at the "Legend Life Warehouse" location; the
 *     nightly sync-legendlife-inventory job keeps it current.
 *   - Images: one flat front per colour (hotlinked from legendlife.com.au,
 *     HEAD-validated) + the style's model shots. No back photos — the Studio
 *     shows its generic back photo for tops.
 *   - Weight: carton mass ÷ carton quantity.
 *   - Brands: one Brand row per label, no parent (Legend Life is the
 *     distributor, recorded in brand metadata — same rule as Shaka Wear).
 *
 * Create-only, keyed by handle: existing handles are skipped. Undecoratable
 * items (gloves, zip pullers…) are skipped, same rule as the nightly sync.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"
import { BRAND_MODULE } from "../../modules/brand"
import { buildPriceLadder } from "../../utils/bulk-price-ladder"
import {
  ladderToTierMinor,
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../../utils/bulk-tier-prices"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
  seedInventoryLevels,
} from "../../lib/supplier-import-pipeline"
import { classifyLegendLifeProduct } from "../../lib/product-taxonomy"
import { checkImageUrl } from "../image-audit/check"
import { isUnprintable } from "./plan"
import {
  LEGENDLIFE_LOCATION_NAME,
  LEGENDLIFE_SOURCE,
  brandHandle,
  brandName,
  colourLabel,
  costFromPricing,
  descriptionFor,
  fetchLegendLifePricingAndStock,
  frontByColour,
  galleryFor,
  handleFor,
  mapLimit,
  sizeLabel,
  stockBySkuFrom,
  titleFor,
  unitWeightGrams,
  type LegendLifePricingAndStock,
  type LegendLifeProduct,
} from "../../lib/legendlife-catalog"

const PRICE_CURRENCY_CODE = "aud"
const BATCH_SIZE = 20

type Style = { p: LegendLifeProduct; ps: LegendLifePricingAndStock; cost: number }
type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

export type LegendLifeImportResult = {
  imported: string[]
  skipped: string[]
  errors: Array<{ code: string; error: string }>
}

export async function importLegendLifeStyles(
  container: MedusaContainer,
  products: LegendLifeProduct[],
  opts: { token: string; costAdjustment?: number; dryRun?: boolean }
): Promise<LegendLifeImportResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const costAdjustment = opts.costAdjustment ?? (Number.parseFloat(process.env.LEGENDLIFE_COST_ADJUSTMENT ?? "1") || 1)
  const result: LegendLifeImportResult = { imported: [], skipped: [], errors: [] }

  const printable = products.filter((p) => {
    if (!isUnprintable(p.name)) return true
    result.skipped.push(p.styleCode)
    return false
  })
  const { data: existing } = await query.graph({
    entity: "product",
    fields: ["handle"],
    filters: { handle: printable.map(handleFor) },
  })
  const existingHandles = new Set((existing ?? []).map((p: any) => p.handle))
  const candidates = printable.filter((p) => {
    if (existingHandles.has(handleFor(p)) || !p.skus?.length) {
      result.skipped.push(p.styleCode)
      return false
    }
    return true
  })
  logger.info(
    `Legend Life import: ${candidates.length} to create, ${result.skipped.length} skipped (existing or undecoratable). costAdjustment=${costAdjustment}, dryRun=${!!opts.dryRun}.`
  )

  // --- Trade price + stock (one call per style) --------------------------------
  const styles = (
    await mapLimit(candidates, 4, async (p): Promise<Style | null> => {
      try {
        const ps = await fetchLegendLifePricingAndStock(p.styleCode, opts.token)
        const cost = costFromPricing(ps.pricing)
        if (!cost) {
          result.errors.push({ code: p.styleCode, error: "No trade price" })
          return null
        }
        return { p, ps, cost: cost * costAdjustment }
      } catch (err: any) {
        result.errors.push({ code: p.styleCode, error: err?.message ?? String(err) })
        return null
      }
    })
  ).filter((s): s is Style => !!s)

  // --- Validate images (HEAD; only 200s are written) ----------------------------
  const urls = [...new Set(styles.flatMap((s) => galleryFor(s.p)))]
  const live = new Set<string>()
  for (let i = 0; i < urls.length; i += 8) {
    const chunk = urls.slice(i, i + 8)
    const results = await Promise.all(chunk.map((u) => checkImageUrl(u, 10_000)))
    results.forEach((r, j) => r.ok && live.add(chunk[j]))
  }
  for (const u of urls.filter((u) => !live.has(u))) {
    await new Promise((r) => setTimeout(r, 150))
    if ((await checkImageUrl(u, 15_000)).ok) live.add(u)
  }
  logger.info(`Legend Life images: ${live.size}/${urls.length} live.`)

  if (opts.dryRun) {
    const s = styles[0]
    if (s) {
      const p = buildProductPayload(s, live, costAdjustment, "dry", "dry")
      logger.info(
        `Sample: ${p.handle} "${p.title}" — ${p.variants.length} variants, ${p.images.length} images, qty1 $${p.variants[0]?.prices?.[0]?.amount}, ${p.variants[0]?.weight ?? "?"} g`
      )
    }
    logger.info(`Dry run — ${styles.length} styles ready, no writes.`)
    return result
  }
  if (!styles.length) return result

  // --- Medusa deps ---------------------------------------------------------------
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const fulfillmentService = container.resolve(Modules.FULFILLMENT) as any
  const [salesChannel] = await salesChannelService.listSalesChannels({ name: "Default Sales Channel" })
  if (!salesChannel) throw new Error("Default Sales Channel not found")
  const [shippingProfile] = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!shippingProfile) throw new Error("Default shipping profile not found")
  const locationId = await ensureLocation(container)
  const brandIds = await ensureBrands(container, [...new Set(styles.map((s) => brandName(s.p)))], logger)

  // --- Create in batches -----------------------------------------------------------
  const sourceByHandle = new Map(styles.map((s) => [handleFor(s.p), s.p]))
  for (let i = 0; i < styles.length; i += BATCH_SIZE) {
    const batch = styles.slice(i, i + BATCH_SIZE)
    let created: any[]
    try {
      const { result: out } = await createProductsWorkflow(container).run({
        input: {
          products: batch.map((s) => buildProductPayload(s, live, costAdjustment, shippingProfile.id, salesChannel.id)),
        },
      })
      created = (out as any[]) ?? []
    } catch (err: any) {
      for (const s of batch) result.errors.push({ code: s.p.styleCode, error: err?.message ?? String(err) })
      logger.error(`Legend Life batch failed (${batch.map((s) => s.p.styleCode).join(",")}): ${err?.message ?? err}`)
      continue
    }

    for (const [name, id] of Object.entries(brandIds)) {
      const mine = created.filter((p) => {
        const src = sourceByHandle.get(p.handle)
        return src && brandName(src) === name
      })
      if (!mine.length) continue
      await linkProductsToBrand(container, mine, id)
      await applyTaxonomyToProducts(container, {
        products: mine,
        sourceByHandle,
        classify: classifyLegendLifeProduct,
        logger,
        brandHandle: brandHandle(name),
      })
    }
    await applyShopCategoriesToProducts(container, created, logger)

    const stockBySku = new Map<string, number>()
    for (const s of batch) for (const [sku, qty] of stockBySkuFrom(s.ps)) stockBySku.set(sku, qty)
    await seedInventoryLevels(container, { stockBySku, locationId, logger })

    const createdHandles = new Set(created.map((p) => p.handle))
    for (const s of batch) if (createdHandles.has(handleFor(s.p))) result.imported.push(s.p.styleCode)
    logger.info(`Legend Life: created ${result.imported.length}/${styles.length}…`)
  }
  return result
}

function buildProductPayload(
  s: Style,
  live: Set<string>,
  costAdjustment: number,
  shippingProfileId: string,
  salesChannelId: string
): any {
  const { p, ps, cost } = s
  const fronts = frontByColour(p)
  const images = galleryFor(p).filter((u) => live.has(u))
  const tierMinor = ladderToTierMinor(buildPriceLadder(cost))
  const weight = unitWeightGrams(p.cartonSpecifications) ?? undefined
  const hasSize = p.skus.some((k) => sizeLabel(k))

  const seen = new Set<string>()
  const variants = p.skus.flatMap((k) => {
    const colour = colourLabel(k)
    const size = sizeLabel(k) ?? "One Size"
    const key = `${colour}|${size}`
    if (seen.has(key)) return []
    seen.add(key)
    const front = fronts.get(colour)
    return [
      {
        title: hasSize ? `${colour} / ${size}` : colour,
        sku: k.sku,
        weight,
        manage_inventory: true,
        allow_backorder: false,
        options: hasSize ? { Colour: colour, Size: size } : { Colour: colour },
        prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
        metadata: {
          legendlife: { style_code: p.styleCode, sku: k.sku, colour, size: sizeLabel(k) },
          bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, LEGENDLIFE_SOURCE),
          cost_adjustment: costAdjustment,
          cost_price_ex_gst_minor: Math.round(cost * 100),
          ...(front && live.has(front) ? { garment_images: { front, all: [front] } } : {}),
          garment_color: colour,
        },
      },
    ]
  })
  const colours = [...new Set(variants.map((v) => v.options.Colour))]
  const sizes = [...new Set(variants.map((v) => (v.options as any).Size).filter(Boolean))]

  return {
    title: titleFor(p),
    // Admin product search covers title/subtitle, not handle/SKU — staff search by style code.
    subtitle: `Style ${p.styleCode}`,
    handle: handleFor(p),
    status: ProductStatus.DRAFT,
    description: descriptionFor(p),
    thumbnail: images[0],
    images: images.map((url) => ({ url })),
    weight,
    options: [{ title: "Colour", values: colours }, ...(hasSize ? [{ title: "Size", values: sizes }] : [])],
    variants,
    shipping_profile_id: shippingProfileId,
    sales_channels: [{ id: salesChannelId }],
    metadata: {
      source: LEGENDLIFE_SOURCE,
      bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, LEGENDLIFE_SOURCE),
      legendlife: {
        style_code: p.styleCode,
        class: p.class,
        brand: brandName(p),
        categorisation: p.categorisation,
        fabric_types: p.fabricTypes,
        rrp: ps.rrpPrice,
        trade_pricing: ps.pricing,
        website_url: p.url,
        last_sync: new Date().toISOString(),
      },
    },
  }
}

async function ensureLocation(container: MedusaContainer): Promise<string> {
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL) as any
  const [found] = await stockLocationService.listStockLocations({ name: LEGENDLIFE_LOCATION_NAME })
  let id: string | undefined = found?.id
  if (!id) {
    const created = await stockLocationService.createStockLocations({ name: LEGENDLIFE_LOCATION_NAME })
    id = (Array.isArray(created) ? created[0] : created).id as string
  }
  const channels = (await salesChannelService.listSalesChannels({}, { take: 500 })) as Array<{ id: string }>
  try {
    await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id, add: channels.map((c) => c.id) } })
  } catch {
    // Idempotent — already-linked channels are fine.
  }
  return id
}

/** Reuse each brand by handle (staff edits win); create missing ones with no parent. */
async function ensureBrands(container: MedusaContainer, names: string[], logger: Logger): Promise<Record<string, string>> {
  const brandService = container.resolve(BRAND_MODULE) as any
  const all = (await brandService.listBrands({})) as Array<{ id: string; handle: string }>
  const byHandle = new Map(all.map((b) => [(b.handle ?? "").toLowerCase(), b.id]))
  const ids: Record<string, string> = {}
  for (const name of names) {
    const handle = brandHandle(name)
    const existingId = byHandle.get(handle)
    if (existingId) {
      ids[name] = existingId
      continue
    }
    const [created] = await brandService.createBrands([
      {
        name,
        handle,
        parent_id: null,
        metadata: { supplier: "Legend Life", supplier_url: "https://www.legendlife.com.au" },
      },
    ])
    ids[name] = created.id
    logger.info(`Created Brand "${name}".`)
  }
  return ids
}
