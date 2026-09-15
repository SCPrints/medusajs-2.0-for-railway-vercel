/**
 * Astorion catalog import — AU wholesale apparel supplier (astorion.com.au).
 *
 * Hybrid of the Shaka Wear and Gildan patterns:
 *   1. COSTS are baked below from the operator-supplied "Astorion Resource &
 *      Info.xlsx" price list (2026-08) — the site only exposes RETAIL prices.
 *      The "Wholesell Price (1~50 Pcs)" tier is treated as SC Prints' ex-GST
 *      cost (same convention as FashionBiz's 1-99 tier); calibrate against the
 *      first real invoice via ASTORION_COST_ADJUSTMENT.
 *   2. Everything else (colours, sizes, images, fabric descriptions, weights)
 *      is fetched LIVE from Astorion's public Shopify catalog JSON
 *      (https://astorion.com.au/products.json) at import time. Their store is
 *      one-product-per-colour with recycled/garbage handles, but titles are
 *      consistently "Style Name (Colour) [W]" — so grouping is title-driven.
 *   3. No stock feed → variants are "always available"
 *      (`manage_inventory: false`), no stock location, no sync cron —
 *      identical to the Gildan / Shaka policy.
 *
 * Known supplier-data quirks handled here:
 *   - Duplicate (style, colour) products (handle-recycled "-copy" rows):
 *     dedupe keeps the row with the most size variants, then latest created.
 *   - "Elemental Polo" ($6.00 placeholder price, absent from the price list)
 *     and "The Heritage Two-Piece Suit" (Items×Size suit, not a print
 *     garment) are intentionally SKIPPED — logged every run.
 *   - The six sportswear polo ranges (Vanguard / True-Dry / Iron-Clad /
 *     Flex-Fit / Cool Mesh / Air-Feel, all $18.99 retail) map to the price
 *     list's single "Workwear Men/Women" row ($13.00 wholesale) — assumption
 *     logged; confirm with Astorion before a big sportswear order.
 *
 * Idempotency: create-only, keyed by handle. Existing handles are skipped.
 * To re-seed a style, delete the product in admin and re-run.
 *
 * Usage:
 *   pnpm --filter backend medusa exec src/scripts/import-astorion.ts
 *   IMPORT_DRY_RUN=1 pnpm --filter backend medusa exec src/scripts/import-astorion.ts
 *   (prod: cd /app/.medusa/server && npx medusa exec src/scripts/import-astorion.js)
 *
 * Env vars:
 *   IMPORT_DRY_RUN            — 1/true to log only, no DB writes
 *   IMPORT_LIMIT              — cap number of styles processed
 *   ASTORION_COST_ADJUSTMENT  — multiplier on the wholesale cost before the
 *                               ladder (default 1.0; set e.g. 0.909 if their
 *                               wholesale prices turn out to be inc-GST)
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
import { parseGsm } from "../utils/parse-gsm"

const PRICE_CURRENCY_CODE = "aud"
const SOURCE = "astorion"
const BRAND_NAME = "Astorion"
const BRAND_HANDLE = "astorion"
const BRAND_EXTERNAL_CODE = "ASTORION"
const SHOP_JSON_URL = "https://astorion.com.au/products.json?limit=250"
const PRICE_LIST = "Astorion Resource & Info.xlsx (2026-08)"

/** One style row from the baked price list. */
type AstorionStyle = {
  /** Normalized site-title key (lowercased, hyphens→spaces) this row matches. */
  key: string
  /** SC Prints product title. */
  title: string
  /** Ex-GST wholesale cost, "1~50 Pcs" tier (AUD). */
  cost: number
  /** Per-colour cost overrides (normalized colour name → cost). */
  costByColour?: Record<string, number>
  /** Full wholesale tier array [1-50, 51-100, 101-200, 201-500] for audit. */
  rawTiers: number[]
  /** Astorion's own retail (1~50) — used only for a sanity-check warning. */
  expectedRetail: number
  productType: string
  tags: string[]
}

// Baked from the xlsx "Pricing" sheet. Sportswear ranges share the
// "Workwear" row's cost (see header note).
const SPORT_TAGS = ["Active"]
const sportsTiers = [13.0, 12.5, 12.0, 11.5]
const sport = (key: string, name: string, women = false): AstorionStyle => ({
  key: women ? `${key} women` : key,
  title: women ? `${name} Sports Polo Women` : `${name} Sports Polo`,
  cost: 13.0,
  rawTiers: sportsTiers,
  expectedRetail: 18.99,
  productType: "Polos",
  tags: [women ? "Women" : "Men", ...SPORT_TAGS],
})

const STYLE_TABLE: AstorionStyle[] = [
  { key: "enhance elemental polo", title: "Enhance Elemental Polo", cost: 9.0, rawTiers: [9.0, 8.5, 8.0, 7.5], expectedRetail: 14.99, productType: "Polos", tags: ["Men"] },
  { key: "classic heavy tee l/s", title: "Classic Heavy Tee L/S", cost: 14.0, rawTiers: [14.0, 13.5, 13.0, 12.5], expectedRetail: 26.99, productType: "Longsleeves", tags: ["Men", "Long Sleeve"] },
  { key: "classic elemental tee", title: "Classic Elemental Tee", cost: 5.9, rawTiers: [5.9, 5.65, 5.4, 5.0], expectedRetail: 10.99, productType: "T-Shirts", tags: ["Men"] },
  { key: "light elemental tee men", title: "Light Elemental Tee Men", cost: 6.0, rawTiers: [6.0, 5.75, 5.5, 5.25], expectedRetail: 8.99, productType: "T-Shirts", tags: ["Men"] },
  { key: "elemental tee men", title: "Elemental Tee Men", cost: 7.5, rawTiers: [7.5, 7.25, 7.0, 6.75], expectedRetail: 13.99, productType: "T-Shirts", tags: ["Men"] },
  { key: "drop shoulder tee", title: "Drop Shoulder Tee", cost: 12.0, rawTiers: [12.0, 11.5, 11.0, 10.75], expectedRetail: 23.99, productType: "T-Shirts", tags: ["Men", "Oversized"] },
  { key: "classic oversize tee", title: "Classic Oversize Tee", cost: 14.0, rawTiers: [14.0, 13.5, 13.0, 12.5], expectedRetail: 24.99, productType: "T-Shirts", tags: ["Men", "Oversized"] },
  { key: "elemental tee women", title: "Elemental Tee Women", cost: 6.5, rawTiers: [6.5, 6.25, 6.0, 5.75], expectedRetail: 9.99, productType: "T-Shirts", tags: ["Women"] },
  { key: "elemental youth tee", title: "Elemental Youth Tee", cost: 5.5, rawTiers: [5.5, 5.25, 5.0, 4.75], expectedRetail: 9.99, productType: "T-Shirts", tags: ["Kids"] },
  { key: "elemental kids tee", title: "Elemental Kids Tee", cost: 5.25, rawTiers: [5.25, 5.0, 4.75, 4.5], expectedRetail: 8.99, productType: "T-Shirts", tags: ["Kids"] },
  {
    key: "urban trendz hoodie",
    title: "Urban Trendz Hoodie",
    cost: 16.0,
    // Price list: Black colourway is dearer ($28.99 retail / $16.99 cost).
    costByColour: { black: 16.99 },
    rawTiers: [16.0, 15.5, 15.0, 14.75],
    expectedRetail: 26.99,
    productType: "Hoodies",
    tags: ["Unisex"],
  },
  { key: "urban trendz zipper hoodie", title: "Urban Trendz Zipper Hoodie", cost: 19.99, rawTiers: [19.99, 19.5, 19.0, 18.75], expectedRetail: 28.99, productType: "Hoodies", tags: ["Unisex"] },
  { key: "sweatshirt", title: "Crewneck Sweatshirt", cost: 16.0, rawTiers: [16.0, 15.5, 15.0, 14.75], expectedRetail: 26.99, productType: "Sweatshirts", tags: ["Unisex"] },
  sport("vanguard", "Vanguard"),
  sport("vanguard", "Vanguard", true),
  sport("true dry", "True-Dry"),
  sport("true dry", "True-Dry", true),
  sport("iron clad", "Iron-Clad"),
  sport("iron clad", "Iron-Clad", true),
  sport("flex fit", "Flex-Fit"),
  sport("flex fit", "Flex-Fit", true),
  sport("cool mesh", "Cool Mesh"),
  sport("cool mesh", "Cool Mesh", true),
  sport("air feel", "Air-Feel"),
  sport("air feel", "Air-Feel", true),
]

/** Site styles we deliberately do NOT import (logged every run). */
const SKIP_STYLES: Record<string, string> = {
  "elemental polo":
    "not on the price list and site shows a $6.00 placeholder price — ask Astorion for the wholesale cost",
  "the heritage two piece suit men":
    "tailored suit (Items × Size options), not a print garment — import manually if wanted",
}

/** Shopify /products.json shapes (only the fields we read). */
type ShopifyVariant = {
  title: string
  option1: string | null
  price: string
  grams: number
}
type ShopifyProduct = {
  title: string
  handle: string
  body_html: string | null
  created_at: string
  product_type: string
  variants: ShopifyVariant[]
  images: Array<{ src: string }>
  options: Array<{ name: string; values: string[] }>
}

const normalizeKey = (s: string): string =>
  s.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim()

const SIZE_MAP: Record<string, string> = { SML: "S", MED: "M", LRG: "L", XLG: "XL" }
const normalizeSize = (s: string): string => SIZE_MAP[s.toUpperCase()] ?? s.toUpperCase()

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

const skuToken = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "")

/** "Style Name (Colour) [W]" → { key, colour } — key normalized, W = womens. */
function parseSiteTitle(title: string): { key: string; colour: string } | null {
  const m = title.trim().match(/^(.*?)\s*\((.*?)\)\s*(W)?$/)
  if (!m) return { key: normalizeKey(title), colour: "Default" }
  const key = normalizeKey(m[1]) + (m[3] ? " women" : "")
  return { key, colour: m[2].trim() }
}

/** Strip HTML + the hidden qstomizer div from a Shopify body_html. */
function stripHtml(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Same per-colour `garment_images` contract as Gildan/Shaka. */
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

export default async function importAstorion({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const flags = new Set(args ?? [])
  const dryRun =
    flags.has("--dry-run") ||
    process.env.IMPORT_DRY_RUN === "1" ||
    process.env.IMPORT_DRY_RUN === "true"
  const limit = process.env.IMPORT_LIMIT
    ? Number.parseInt(process.env.IMPORT_LIMIT, 10)
    : undefined
  const costAdjustment = Number.parseFloat(
    process.env.ASTORION_COST_ADJUSTMENT ?? "1"
  )
  if (!Number.isFinite(costAdjustment) || costAdjustment <= 0) {
    throw new Error(`Bad ASTORION_COST_ADJUSTMENT: ${process.env.ASTORION_COST_ADJUSTMENT}`)
  }

  logger.info(
    `Astorion import — dryRun=${dryRun}, costAdjustment=${costAdjustment}. Costs: ${PRICE_LIST}; catalog: ${SHOP_JSON_URL}`
  )

  // 1. Fetch the live Shopify catalog (single page covers the ~123 products;
  //    paginate defensively in case they grow past 250).
  const siteProducts: ShopifyProduct[] = []
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`${SHOP_JSON_URL}&page=${page}`)
    if (!res.ok) throw new Error(`Astorion products.json HTTP ${res.status}`)
    const batch = ((await res.json()) as { products: ShopifyProduct[] }).products
    siteProducts.push(...batch)
    if (batch.length < 250) break
  }
  logger.info(`Fetched ${siteProducts.length} site products.`)

  // 2. Group one-product-per-colour rows into styles by parsed title,
  //    deduping recycled duplicates (most variants wins, then newest).
  const byStyleColour = new Map<string, Map<string, ShopifyProduct>>()
  const unmatched: string[] = []
  for (const p of siteProducts) {
    const parsed = parseSiteTitle(p.title)
    if (!parsed) continue
    const { key, colour } = parsed
    if (key in SKIP_STYLES) continue
    if (!STYLE_TABLE.some((s) => s.key === key)) {
      unmatched.push(`"${p.title}" (${p.handle})`)
      continue
    }
    const colours = byStyleColour.get(key) ?? new Map<string, ShopifyProduct>()
    byStyleColour.set(key, colours)
    const existing = colours.get(colour)
    if (
      !existing ||
      p.variants.length > existing.variants.length ||
      (p.variants.length === existing.variants.length &&
        p.created_at > existing.created_at)
    ) {
      colours.set(colour, p)
    }
  }
  for (const [key, why] of Object.entries(SKIP_STYLES)) {
    logger.warn(`  Skipping style "${key}": ${why}`)
  }
  if (unmatched.length) {
    logger.warn(
      `  ${unmatched.length} site product(s) matched no price-list style (skipped): ${unmatched.join(", ")}`
    )
  }

  let styles = STYLE_TABLE.filter((s) => byStyleColour.has(s.key))
  if (limit) styles = styles.slice(0, limit)
  logger.info(`Matched ${styles.length} style(s) with site data.`)

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

  const brandId = await ensureAstorionBrand({ brandService, logger, dryRun })

  // Existing-handle lookup so re-runs skip already-imported styles.
  const allHandles = styles.map((s) => `astorion-${slugify(s.title)}`)
  const { data: existingRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle"],
    filters: { handle: allHandles },
  })
  const existingHandles = new Set((existingRows ?? []).map((p: any) => p.handle))

  type CreatedCtx = { handle: string; style: AstorionStyle }
  const toCreate: any[] = []
  const created: CreatedCtx[] = []
  let calibrationLogs = 0

  for (const style of styles) {
    const handle = `astorion-${slugify(style.title)}`
    if (existingHandles.has(handle)) {
      logger.info(`  Skipping existing handle ${handle}`)
      continue
    }

    const colourProducts = byStyleColour.get(style.key)!
    const colourNames = [...colourProducts.keys()]

    // Size option = union across colours, in first-seen order.
    const sizeValues: string[] = []
    for (const p of colourProducts.values()) {
      for (const v of p.variants) {
        const size = normalizeSize(v.option1 ?? v.title)
        if (!sizeValues.includes(size)) sizeValues.push(size)
      }
    }
    const options = [
      { title: "Colour", values: colourNames },
      { title: "Size", values: sizeValues },
    ]

    // Description + gsm from the first colour's body (fabric/fit specs are
    // consistent across colours of a style).
    const first = [...colourProducts.values()][0]
    const description = stripHtml(first.body_html)
    const gsm = parseGsm(description) ?? parseGsm(first.handle)
    const weightGrams = first.variants[0]?.grams || undefined

    // Retail sanity check against the price list.
    for (const [colour, p] of colourProducts) {
      const sitePrice = Number.parseFloat(p.variants[0]?.price ?? "0")
      const expected =
        style.costByColour?.[normalizeKey(colour)] != null
          ? null // colour-specific cost rows have their own retail; skip check
          : style.expectedRetail
      if (expected != null && Math.abs(sitePrice - expected) > 0.005) {
        logger.warn(
          `  [retail-mismatch] ${style.title} (${colour}): site $${sitePrice} vs price-list $${expected} — cost table may be stale for this colourway.`
        )
      }
    }

    // Product-level gallery = union of every colour's images.
    const productImages: Array<{ url: string }> = []
    const seenUrls = new Set<string>()
    for (const p of colourProducts.values()) {
      for (const img of p.images) {
        if (img.src && !seenUrls.has(img.src)) {
          seenUrls.add(img.src)
          productImages.push({ url: img.src })
        }
      }
    }
    const thumbnail = productImages[0]?.url

    // Cheapest colour cost drives the product-level bulk_pricing block.
    const colourCost = (colour: string): number =>
      (style.costByColour?.[normalizeKey(colour)] ?? style.cost) * costAdjustment
    const minCost = Math.min(...colourNames.map(colourCost))
    const productBulkPricing = tierMinorToBulkPricingMetadata(
      ladderToTierMinor(buildPriceLadder(minCost)),
      SOURCE
    )

    if (calibrationLogs < 5) {
      calibrationLogs++
      const ladder = buildPriceLadder(minCost)
      logger.info(
        `  [calibration] ${style.title}: wholesale $${style.cost} ×${costAdjustment} → retail base $${ladder.base} / 100+ $${ladder.tier100Plus} (Astorion's own retail: $${style.expectedRetail})`
      )
    }

    const variants: any[] = []
    const seenSkus = new Set<string>()
    for (const [colour, p] of colourProducts) {
      const garmentImages = buildGarmentImages(p.images.map((i) => i.src))
      const cost = colourCost(colour)
      const tierMinor = ladderToTierMinor(buildPriceLadder(cost))
      for (const v of p.variants) {
        const size = normalizeSize(v.option1 ?? v.title)
        const sku = `AST-${skuToken(style.title)}-${skuToken(colour)}-${skuToken(size)}`
        if (seenSkus.has(sku)) continue
        seenSkus.add(sku)
        variants.push({
          title: `${colour} / ${size}`,
          sku,
          manage_inventory: false,
          allow_backorder: true,
          options: { Colour: colour, Size: size },
          prices: tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE),
          metadata: {
            astorion: {
              site_handle: p.handle,
              colour_name: colour,
              size,
            },
            bulk_pricing: tierMinorToBulkPricingMetadata(tierMinor, SOURCE),
            cost_adjustment: costAdjustment,
            cost_price_ex_gst_minor: Math.round(cost * 100),
            raw_prices: style.rawTiers,
            garment_images: garmentImages,
            garment_color: colour,
          },
        })
      }
    }

    toCreate.push({
      title: style.title,
      handle,
      status: ProductStatus.PUBLISHED,
      description,
      thumbnail,
      weight: weightGrams,
      images: productImages,
      options,
      variants,
      shipping_profile_id: shippingProfileId,
      sales_channels: [{ id: defaultSalesChannelId }],
      metadata: {
        source: SOURCE,
        gsm,
        bulk_pricing: productBulkPricing,
        astorion: {
          style_key: style.key,
          site_handles: [...colourProducts.values()].map((p) => p.handle),
          price_list: PRICE_LIST,
          wholesale_tiers: style.rawTiers,
          last_sync: new Date().toISOString(),
        },
      },
    })
    created.push({ handle, style })
    logger.info(
      `  Prepared ${handle}: ${colourNames.length} colours × ${sizeValues.length} sizes = ${variants.length} variants (${productImages.length} images).`
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

    const sourceByHandle = new Map<string, AstorionStyle>()
    for (const ctx of created) sourceByHandle.set(ctx.handle, ctx.style)
    await applyTaxonomyToProducts(container, {
      products: createdProducts,
      sourceByHandle,
      classify: (style: AstorionStyle) => ({
        productType: style.productType,
        tags: style.tags,
      }),
      logger,
      brandHandle: BRAND_HANDLE,
    })
    await applyShopCategoriesToProducts(container, createdProducts, logger)
    await linkProductsToBrand(
      container,
      createdProducts as Array<{ id: string; handle: string }>,
      brandId
    )
  } else {
    logger.info("Nothing to create — all styles already exist.")
  }

  // Bust storefront tag caches so the new brand + listings appear immediately.
  const purgeTags = new Set<string>(["categories", ...tagsForBrand(BRAND_HANDLE)])
  for (const ctx of created) {
    for (const t of tagsForProduct(ctx.handle)) purgeTags.add(t)
  }
  await revalidateStorefrontTags([...purgeTags], logger)

  logger.info("Astorion import complete.")
}

/** Ensure the standalone "Astorion" brand exists. Returns its id. */
async function ensureAstorionBrand(opts: {
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
      logo_url:
        "https://astorion.com.au/cdn/shop/files/Astorion_Logo_3462d1eb-2f3d-4f0f-8d68-3be8f15345f7.jpg",
      metadata: {
        brand_url: "https://astorion.com.au",
        country: "Australia",
      },
    },
  ])
  logger.info(`Created Brand "${BRAND_NAME}" (id ${created.id}).`)
  return created.id
}
