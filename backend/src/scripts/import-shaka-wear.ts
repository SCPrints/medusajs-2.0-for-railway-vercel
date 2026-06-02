/**
 * Shaka Wear catalog import — seeds the 6 Shaka Wear styles SC Prints buys
 * from the Australian distributor "Prime Example".
 *
 * Differs from the API-driven importers (AS Colour / FashionBiz / Aussie
 * Pacific) and even from Gildan:
 *   1. There is NO supplier API and NO CSV — the only source is Prime
 *      Example's PDF wholesale price list + 2026 catalogue. The resolved
 *      data (sizes, ex-GST costs, AU-stocked colours) lives baked into
 *      ./shaka-wear-catalog.ts.
 *   2. Images are hotlinked from the Shaka Wear US site (Shopify CDN),
 *      matched to the AU colour names — same hotlink approach as Gildan's
 *      BigCommerce images, but resolved once at data-gen time rather than
 *      scraped per-run.
 *   3. No stock data → variants are "always available"
 *      (`manage_inventory: false`), no stock location, no daily sync cron —
 *      identical to the Gildan policy.
 *
 * Pricing: the price list states "Price Ex GST", so each size's cost feeds
 * the shared buildPriceLadder() directly (cost-adjustment 1.0). Cost is
 * PER-SIZE because 10M-001's 3XL and 10M-005's 2XL are dearer than their
 * base sizes — each variant gets its own ladder (the AS Colour within-style
 * cost-variation pattern).
 *
 * Idempotency: create-only, keyed by handle. Existing handles are skipped
 * (re-run is safe). To re-seed from scratch, delete the products in admin
 * and re-run.
 *
 * Usage:
 *   pnpm --filter backend medusa exec src/scripts/import-shaka-wear.ts
 *   IMPORT_DRY_RUN=1 pnpm --filter backend medusa exec src/scripts/import-shaka-wear.ts
 *
 * Env vars:
 *   IMPORT_DRY_RUN   — 1/true to log only, no DB writes
 *   IMPORT_LIMIT     — cap number of styles processed (for testing)
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
import { SHAKA_WEAR_CATALOG, type ShakaStyle } from "./shaka-wear-catalog"
import { parseGsm } from "../utils/parse-gsm"

const PRICE_CURRENCY_CODE = "aud"
const SOURCE = "shaka-wear"
const BRAND_NAME = "Shaka Wear"
const BRAND_HANDLE = "shaka-wear"
const BRAND_EXTERNAL_CODE = "SHAKA"
const DISTRIBUTOR = "Prime Example"
const PRICE_LIST = "Printer Partner January 2026"
const COMPOSITION = "100% USA Cotton"
const FABRIC_WEIGHT = "7.5 oz / 255 GSM"
// Storefront logo is served locally (storefront/public/images/brands/logos/
// shaka-wear.png) via the brand-presentation map — so the brand row's
// logo_url stays null and the storefront falls through to it. The presentation
// logo is recoloured to the muted grey the other brand tiles use so it reads
// on both the dark mega-menu tile and the light brand-hero chip.

// Approximate per-garment shipping weight (grams). The price list carries no
// garment weight; these are calibrated estimates for a 7.5oz heavyweight knit
// so shipping-rate quotes aren't packaging-overhead-only. Re-calibrate against
// a real parcel weigh-in.
const WEIGHT_GRAMS_BY_CODE: Record<string, number> = {
  "10M-001": 250,
  "10M-002": 250,
  "10M-003": 300,
  "10M-005": 300,
  "10M-006": 180,
  "10M-104": 320,
}

/** Uppercase-alphanumeric colour token for a deterministic SKU. */
const colourSku = (name: string): string =>
  name.toUpperCase().replace(/[^A-Z0-9]/g, "")

/** `SW-10M001-DARKGREY-3XL` — deterministic, re-runnable, globally unique. */
const buildSku = (code: string, colour: string, size: string): string =>
  `SW-${code.replace(/-/g, "")}-${colourSku(colour)}-${size.toUpperCase()}`

/** Marketing description (scraped) + the spec block staff/customers expect. */
function renderShakaDescription(style: ShakaStyle): string {
  const parts: string[] = []
  if (style.description) parts.push(style.description)
  const specs = [
    `Fabric: ${COMPOSITION}`,
    `Weight: ${FABRIC_WEIGHT}`,
    style.fit ? `Fit: ${style.fit}` : null,
  ].filter(Boolean)
  parts.push(specs.join("\n"))
  return parts.join("\n\n")
}

/**
 * Per-colour `garment_images` block — the storefront PDP colour-swap +
 * customizer contract (front load-bearing; back/model optional; `all` is the
 * gallery). Mirrors `buildGildanGarmentImages`'s output shape.
 */
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

export default async function importShakaWear({ container, args }: ExecArgs) {
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

  let styles: ShakaStyle[] = SHAKA_WEAR_CATALOG
  if (limit) styles = styles.slice(0, limit)

  logger.info(
    `Shaka Wear import — ${styles.length} style(s), dryRun=${dryRun}. Source: ${DISTRIBUTOR} "${PRICE_LIST}".`
  )

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
  if (!shippingProfiles.length)
    throw new Error("Default shipping profile not found")
  const shippingProfileId = shippingProfiles[0].id

  // Ensure the Shaka Wear brand exists (standalone — no parent). Distributor
  // (Prime Example) is recorded in metadata, not as a parent brand.
  const brandId = await ensureShakaWearBrand({ brandService, logger, dryRun })

  // Existing-handle lookup so re-runs skip already-imported styles.
  const allHandles = styles.map((s) => s.handle)
  const { data: existingRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: allHandles },
  })
  const existingHandles = new Set((existingRows ?? []).map((p: any) => p.handle))

  type CreatedCtx = { handle: string; style: ShakaStyle }
  const toCreate: any[] = []
  const created: CreatedCtx[] = []

  for (const style of styles) {
    if (existingHandles.has(style.handle)) {
      logger.info(`  Skipping existing handle ${style.handle}`)
      continue
    }

    const sizeCodes = style.sizes.map((s) => s.code)
    const colourNames = style.colours.map((c) => c.name)
    const options = [
      { title: "Colour", values: colourNames },
      { title: "Size", values: sizeCodes },
    ]

    // Product-level image gallery = union of every colour's images (dedup,
    // colour order preserved). Thumbnail = first colour's front.
    const productImages: Array<{ url: string }> = []
    const seenUrls = new Set<string>()
    for (const colour of style.colours) {
      for (const url of colour.images) {
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url)
          productImages.push({ url })
        }
      }
    }
    const thumbnail = productImages[0]?.url

    // Cheapest size drives the product-level bulk_pricing block (storefront
    // tile headline / tier-display parity, matching the AS Colour pattern).
    const minCost = Math.min(...style.sizes.map((s) => s.cost))
    const productBulkPricing = tierMinorToBulkPricingMetadata(
      ladderToTierMinor(buildPriceLadder(minCost)),
      SOURCE
    )

    const variants: any[] = []
    const seenSkus = new Set<string>()
    for (const colour of style.colours) {
      const garmentImages = buildGarmentImages(colour.images)
      for (const size of style.sizes) {
        const sku = buildSku(style.code, colour.name, size.code)
        if (seenSkus.has(sku)) continue
        seenSkus.add(sku)

        // Per-size ladder — faithful to the price list's size-dependent cost.
        const tierMinor = ladderToTierMinor(buildPriceLadder(size.cost))
        const costMinor = Math.round(size.cost * 100)

        variants.push({
          title: `${colour.name} / ${size.code}`,
          sku,
          manage_inventory: false,
          allow_backorder: true,
          options: { Colour: colour.name, Size: size.code },
          prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
          metadata: {
            shaka_wear: {
              style_code: style.code,
              fit: style.fit,
              colour_name: colour.name,
              us_colour_match: colour.us_match,
              size_code: size.code,
              country_of_origin: "USA",
              distributor: DISTRIBUTOR,
            },
            bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, SOURCE),
            cost_adjustment: 1.0,
            cost_price_ex_gst_minor: costMinor,
            garment_images: garmentImages,
            garment_color: colour.name,
          },
        })
      }
    }

    const productPayload: any = {
      title: style.title,
      handle: style.handle,
      status: ProductStatus.PUBLISHED,
      description: renderShakaDescription(style),
      thumbnail,
      material: COMPOSITION,
      weight: WEIGHT_GRAMS_BY_CODE[style.code] ?? undefined,
      images: productImages,
      options,
      variants,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
      metadata: {
        source: SOURCE,
        // FABRIC_WEIGHT is "7.5 oz / 255 GSM" — parseGsm extracts 255.
        gsm: parseGsm(FABRIC_WEIGHT),
        bulk_pricing: productBulkPricing,
        shaka_wear: {
          style_code: style.code,
          us_url: style.us_url,
          fit: style.fit,
          composition: COMPOSITION,
          fabric_weight: FABRIC_WEIGHT,
          distributor: DISTRIBUTOR,
          price_list: PRICE_LIST,
          last_sync: new Date().toISOString(),
        },
      },
    }

    toCreate.push(productPayload)
    created.push({ handle: style.handle, style })
    logger.info(
      `  Prepared ${style.handle}: ${colourNames.length} colours × ${sizeCodes.length} sizes = ${variants.length} variants (${productImages.length} images).`
    )
  }

  logger.info(`Prepared ${toCreate.length} product(s) for create.`)

  if (dryRun) {
    logger.info("Dry run — skipping createProductsWorkflow.")
    if (toCreate.length) {
      const s = toCreate[0]
      logger.info(
        `Sample CREATE: handle=${s.handle} variants=${s.variants.length} base=$${s.variants[0]?.prices?.[0]?.amount} (qty1-9), 100+=$${s.variants[0]?.prices?.[4]?.amount}`
      )
    }
    return
  }
  if (toCreate.length) {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: toCreate },
    })
    const createdProducts = (result as any[]) ?? []
    logger.info(`Created ${createdProducts.length} products.`)

    // Taxonomy: every Shaka Wear style is a unisex T-Shirt; tags carry sleeve +
    // oversized signals. applyTitleFallbacks then back-fills from the title.
    const sourceByHandle = new Map<string, ShakaStyle>()
    for (const ctx of created) sourceByHandle.set(ctx.handle, ctx.style)
    await applyTaxonomyToProducts(container, {
      products: createdProducts,
      sourceByHandle,
      classify: (style: ShakaStyle) => ({
        productType: "T-Shirts",
        tags: style.tags,
      }),
      logger,
      brandHandle: BRAND_HANDLE,
    })

    // Shop categories — Unisex cross-lists into both mens + womens t-shirts.
    await applyShopCategoriesToProducts(container, createdProducts, logger)

    // Brand link — all six products to the one Shaka Wear brand.
    await linkProductsToBrand(
      container,
      createdProducts as Array<{ id: string; handle: string }>,
      brandId
    )
  } else {
    logger.info("Nothing to create — all styles already exist.")
  }

  // Bust the storefront's tag-based caches so the new brand card (the cached
  // `brands` list has a 10-min revalidate), the brand's product grid, and the
  // mens/womens T-Shirt category listings appear immediately instead of after
  // the revalidate window. Creating a brand via the service emits no event the
  // storefront listens for, so without this the `brands` list stays stale.
  // Runs even on a no-op re-run, so this script doubles as a "refresh the
  // storefront for Shaka Wear" command. No-ops in dev when STOREFRONT_URL /
  // REVALIDATE_SECRET are unset.
  // (dry-run already returned above, so this only runs on a real import.)
  const purgeTags = new Set<string>(["categories", ...tagsForBrand(BRAND_HANDLE)])
  for (const style of styles) {
    for (const t of tagsForProduct(style.handle)) purgeTags.add(t)
  }
  await revalidateStorefrontTags([...purgeTags], logger)

  logger.info("Shaka Wear import complete.")
}

/**
 * Ensure the standalone "Shaka Wear" brand exists. Returns its id. Reuses an
 * existing brand (by handle) regardless of who created it; only fills the
 * logo + metadata gaps on a freshly-created row.
 */
async function ensureShakaWearBrand(opts: {
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
      // logo_url left null on purpose — see the storefront-logo note above.
      metadata: {
        distributor: DISTRIBUTOR,
        distributor_url: "https://prime-example.com.au",
        brand_url: "https://www.shakawear.com",
        country_of_origin: "USA",
      },
    },
  ])
  logger.info(`Created Brand "${BRAND_NAME}" (id ${created.id}).`)
  return created.id
}
