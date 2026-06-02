/**
 * Thread Lab catalog import — seeds 10 Thread Lab styles.
 *
 * Differs from API-driven importers (AS Colour / FashionBiz / Aussie Pacific):
 *   1. No supplier API — product specs live baked into ./thread-lab-catalog.ts.
 *   2. Images are fetched at import time from Thread Lab's Shopify store
 *      (/products/<slug>.json) and hotlinked from cdn.shopify.com — same CDN
 *      already trusted by the storefront (next.config.js remotePatterns).
 *   3. No stock data → variants are "always available" (manage_inventory: false,
 *      allow_backorder: true) — identical to the Gildan / Shaka Wear policy.
 *
 * ⚠ Costs in thread-lab-catalog.ts are PLACEHOLDERS. Update them from your
 * actual Thread Lab wholesale price list before running on production.
 *
 * Usage:
 *   pnpm --filter backend medusa exec src/scripts/import-thread-lab.ts
 *   IMPORT_DRY_RUN=1 pnpm --filter backend medusa exec src/scripts/import-thread-lab.ts
 *
 * Env vars:
 *   IMPORT_DRY_RUN   — 1/true to log only, no DB writes
 *   IMPORT_LIMIT     — cap number of styles processed (for testing)
 *
 * Idempotency: create-only, keyed by handle. Existing handles are skipped.
 * To re-seed from scratch, delete the products in admin and re-run.
 */

import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { BRAND_MODULE } from "../modules/brand"
import { buildPriceLadder } from "../utils/bulk-price-ladder"
import {
  ladderToTierMinor,
  tierMinorToBulkPricingMetadata,
  tierMinorToPriceSetRows,
} from "../utils/bulk-tier-prices"
import {
  applyShopCategoriesToProducts,
  applyTaxonomyToProducts,
  linkProductsToBrand,
} from "../lib/supplier-import-pipeline"
import {
  revalidateStorefrontTags,
  tagsForBrand,
  tagsForProduct,
} from "../lib/storefront-revalidate"
import { THREAD_LAB_CATALOG, type ThreadLabStyle } from "./thread-lab-catalog"

const PRICE_CURRENCY_CODE = "aud"
const SOURCE = "thread-lab"
const BRAND_NAME = "Thread Lab"
const BRAND_HANDLE = "thread-lab"
const BRAND_EXTERNAL_CODE = "TL"
const BRAND_URL = "https://www.threadlab.com.au"

/** Uppercase-alphanumeric colour token for a deterministic SKU. */
const colourSku = (name: string): string =>
  name.toUpperCase().replace(/[^A-Z0-9]/g, "")

/** `TL-CTEE-BLACK-S` — deterministic, re-runnable, globally unique. */
const buildSku = (code: string, colour: string, size: string): string =>
  `TL-${code}-${colourSku(colour)}-${size.toUpperCase()}`

// ---------------------------------------------------------------------------
// Shopify image fetching
// ---------------------------------------------------------------------------

type ShopifyProductJson = {
  product: {
    images: Array<{
      id: number
      src: string
      variant_ids: number[]
    }>
    variants: Array<{
      id: number
      option1: string // Colour
      option2: string // Size
    }>
  }
}

/**
 * Fetch all images from Thread Lab's Shopify product JSON and group them by
 * colour name. Images with no variant_ids are unassigned (shared across all
 * colours). Deduplicates within each colour's list.
 */
async function fetchColourImages(
  slug: string,
  colours: string[],
  logger: { warn: (m: string) => void }
): Promise<Record<string, string[]>> {
  const url = `${BRAND_URL}/products/${slug}.json`
  let data: ShopifyProductJson
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      logger.warn(`Image fetch failed for ${slug}: HTTP ${res.status}`)
      return buildFallback(colours)
    }
    data = await res.json()
  } catch (err: any) {
    logger.warn(`Image fetch error for ${slug}: ${err?.message ?? err}`)
    return buildFallback(colours)
  }

  const { images, variants } = data.product

  // variant ID → colour name
  const variantToColour = new Map<number, string>()
  for (const v of variants) {
    if (v.option1) variantToColour.set(v.id, v.option1)
  }

  // colour → deduplicated image URL list
  const colourImages: Record<string, string[]> = {}
  const colourSeen: Record<string, Set<string>> = {}
  for (const c of colours) {
    colourImages[c] = []
    colourSeen[c] = new Set()
  }

  for (const img of images) {
    const src = img.src
    if (!src) continue

    if (img.variant_ids.length === 0) {
      // unassigned → add to all colours
      for (const c of colours) {
        if (!colourSeen[c].has(src)) {
          colourSeen[c].add(src)
          colourImages[c].push(src)
        }
      }
    } else {
      const imgColours = new Set<string>()
      for (const vid of img.variant_ids) {
        const c = variantToColour.get(vid)
        if (c && colourImages[c] !== undefined) imgColours.add(c)
      }
      for (const c of imgColours) {
        if (!colourSeen[c].has(src)) {
          colourSeen[c].add(src)
          colourImages[c].push(src)
        }
      }
    }
  }

  return colourImages
}

function buildFallback(colours: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const c of colours) out[c] = []
  return out
}

// ---------------------------------------------------------------------------
// garment_images shape (PDP colour-swap + customizer contract)
// ---------------------------------------------------------------------------

function buildGarmentImages(images: string[]): {
  front: string
  back?: string
  model_image?: string
  all: string[]
} {
  const all = images.filter(Boolean)
  return {
    front: all[0] ?? "",
    ...(all[1] ? { back: all[1] } : {}),
    ...(all[2] ? { model_image: all[2] } : {}),
    all,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default async function importThreadLab({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const flags = new Set(args ?? [])
  const limitArg = (args ?? []).find((a) => a.startsWith("--limit="))
  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : process.env.IMPORT_LIMIT
      ? Number.parseInt(process.env.IMPORT_LIMIT, 10)
      : undefined
  const dryRun =
    flags.has("--dry-run") ||
    process.env.IMPORT_DRY_RUN === "1" ||
    process.env.IMPORT_DRY_RUN === "true"

  let styles: ThreadLabStyle[] = THREAD_LAB_CATALOG
  if (limit) styles = styles.slice(0, limit)

  logger.info(
    `Thread Lab import — ${styles.length} style(s), dryRun=${dryRun}.`
  )

  // Medusa dependencies
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
  if (!shippingProfiles.length)
    throw new Error("Default shipping profile not found")
  const shippingProfileId = shippingProfiles[0].id

  const brandId = await ensureThreadLabBrand({ brandService, logger, dryRun })

  // Idempotency: skip existing handles
  const allHandles = styles.map((s) => s.handle)
  const { data: existingRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: allHandles },
  })
  const existingHandles = new Set(
    (existingRows ?? []).map((p: any) => p.handle)
  )

  type CreatedCtx = { handle: string; style: ThreadLabStyle }
  const toCreate: any[] = []
  const created: CreatedCtx[] = []

  for (const style of styles) {
    if (existingHandles.has(style.handle)) {
      logger.info(`  Skipping existing handle ${style.handle}`)
      continue
    }

    // Fetch all colour → images from Thread Lab Shopify JSON
    logger.info(`  Fetching images for ${style.slug}…`)
    const colourImages = await fetchColourImages(
      style.slug,
      style.colours,
      logger
    )

    const sizeCodes = style.sizes.map((s) => s.code)
    const options = [
      { title: "Colour", values: style.colours },
      { title: "Size", values: sizeCodes },
    ]

    // Product-level gallery = union of all colour images (colour order)
    const productImages: Array<{ url: string }> = []
    const seenUrls = new Set<string>()
    for (const colour of style.colours) {
      for (const url of colourImages[colour] ?? []) {
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url)
          productImages.push({ url })
        }
      }
    }
    const thumbnail = productImages[0]?.url

    // Cheapest size drives the product-level bulk_pricing metadata
    const minCost = Math.min(...style.sizes.map((s) => s.cost))
    const productBulkPricing = tierMinorToBulkPricingMetadata(
      ladderToTierMinor(buildPriceLadder(minCost)),
      SOURCE
    )

    const variants: any[] = []
    const seenSkus = new Set<string>()
    for (const colour of style.colours) {
      const garmentImages = buildGarmentImages(colourImages[colour] ?? [])
      for (const size of style.sizes) {
        const sku = buildSku(style.code, colour, size.code)
        if (seenSkus.has(sku)) continue
        seenSkus.add(sku)

        const tierMinor = ladderToTierMinor(buildPriceLadder(size.cost))
        const costMinor = Math.round(size.cost * 100)

        variants.push({
          title: `${colour} / ${size.code}`,
          sku,
          manage_inventory: false,
          allow_backorder: true,
          options: { Colour: colour, Size: size.code },
          prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
          metadata: {
            thread_lab: {
              style_code: style.code,
              slug: style.slug,
              colour_name: colour,
              size_code: size.code,
            },
            bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, SOURCE),
            cost_adjustment: 1.0,
            cost_price_ex_gst_minor: costMinor,
            garment_images: garmentImages,
            garment_color: colour,
          },
        })
      }
    }

    const productPayload: any = {
      title: style.title,
      handle: style.handle,
      status: ProductStatus.PUBLISHED,
      description: style.description,
      thumbnail,
      material: style.composition,
      weight: style.weight_grams,
      images: productImages,
      options,
      variants,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
      metadata: {
        source: SOURCE,
        bulk_pricing: productBulkPricing,
        thread_lab: {
          style_code: style.code,
          slug: style.slug,
          brand_url: `${BRAND_URL}/products/${style.slug}`,
          composition: style.composition,
          gsm: style.gsm,
          last_sync: new Date().toISOString(),
        },
      },
    }

    toCreate.push(productPayload)
    created.push({ handle: style.handle, style })
    logger.info(
      `  Prepared ${style.handle}: ${style.colours.length} colours × ${sizeCodes.length} sizes = ${variants.length} variants (${productImages.length} images).`
    )
  }

  logger.info(`Prepared ${toCreate.length} product(s) for create.`)

  if (dryRun) {
    logger.info("Dry run — skipping createProductsWorkflow.")
    if (toCreate.length) {
      const s = toCreate[0]
      logger.info(
        `Sample CREATE: handle=${s.handle} variants=${s.variants.length} images=${s.images.length}`
      )
    }
    return
  }

  if (!toCreate.length) {
    logger.info("Nothing to create — all styles already exist.")
  } else {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: toCreate },
    })
    const createdProducts = (result as any[]) ?? []
    logger.info(`Created ${createdProducts.length} products.`)

    // Taxonomy
    const sourceByHandle = new Map<string, ThreadLabStyle>()
    for (const ctx of created) sourceByHandle.set(ctx.handle, ctx.style)
    await applyTaxonomyToProducts(container, {
      products: createdProducts,
      sourceByHandle,
      classify: (style: ThreadLabStyle) => ({
        productType: style.product_type,
        tags: style.tags,
      }),
      logger,
      brandHandle: BRAND_HANDLE,
    })

    // Shop categories
    await applyShopCategoriesToProducts(container, createdProducts, logger)

    // Brand link
    await linkProductsToBrand(
      container,
      createdProducts as Array<{ id: string; handle: string }>,
      brandId
    )
  }

  // Bust storefront caches
  const purgeTags = new Set<string>(["categories", ...tagsForBrand(BRAND_HANDLE)])
  for (const style of styles) {
    for (const t of tagsForProduct(style.handle)) purgeTags.add(t)
  }
  await revalidateStorefrontTags([...purgeTags], logger)

  logger.info("Thread Lab import complete.")
}

// ---------------------------------------------------------------------------
// Brand bootstrap
// ---------------------------------------------------------------------------

async function ensureThreadLabBrand(opts: {
  brandService: any
  logger: { info: (m: string) => void; warn: (m: string) => void }
  dryRun?: boolean
}): Promise<string> {
  const { brandService, logger, dryRun } = opts
  const all = (await brandService.listBrands({})) as Array<{
    id: string
    handle: string
  }>
  const existing = all.find(
    (b) => (b.handle ?? "").toLowerCase() === BRAND_HANDLE
  )
  if (existing) {
    logger.info(`Reusing existing Brand "${BRAND_NAME}" (id ${existing.id}).`)
    return existing.id
  }
  if (dryRun) {
    logger.info(`[dry-run] Would create Brand "${BRAND_NAME}".`)
    return "dry-run-brand-id"
  }
  const [created] = await brandService.createBrands([
    {
      name: BRAND_NAME,
      handle: BRAND_HANDLE,
      external_code: BRAND_EXTERNAL_CODE,
      parent_id: null,
      description:
        "Thread Lab is a Melbourne-based premium blank apparel brand built for decoration. Two ranges — the 200–275 GSM Core line for everyday print volume, and the 480 GSM Elevated line in 100% spiro spun combed cotton for premium commissions.",
      metadata: {
        brand_url: BRAND_URL,
        country_of_origin: "AU",
        origin_city: "Melbourne",
      },
    },
  ])
  logger.info(`Created Brand "${BRAND_NAME}" (id ${created.id}).`)
  return created.id
}
