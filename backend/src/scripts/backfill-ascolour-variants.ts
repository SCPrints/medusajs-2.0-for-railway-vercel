import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createInventoryLevelsWorkflow,
  createProductVariantsWorkflow,
  updateProductOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

import { ASCOLOUR_MODULE } from "../modules/ascolour"
import AsColourService from "../modules/ascolour/service"
import { buildPriceLadder, type PriceLadder } from "../modules/ascolour/pricing"
import {
  AsColourProduct,
  AsColourVariant,
} from "../modules/ascolour/types"
import {
  tierMinorToPriceSetRows,
  tierMinorToBulkPricingMetadata,
  type TierMoneyMinor,
} from "../utils/bulk-tier-prices"

/**
 * Backfill missing colour/size variants on existing AS Colour products.
 *
 * The original importer (`import-as-colour-from-api.ts`) is create-only by
 * product handle — if the Staple Tee already exists in our DB and AS Colour
 * has added 46 new colours since the last import, re-running the importer
 * skips the product entirely and the new colours never land.
 *
 * This script walks each existing AS Colour product, fetches the live
 * variant list from the API, computes which SKUs are missing, and creates
 * just those — leaving existing variant IDs untouched so cart lines, order
 * history, bundles, and lookbook entries that reference them keep working.
 *
 * Env vars (all optional):
 *   BACKFILL_DRY_RUN=1       — log what would change, don't write
 *   BACKFILL_HANDLES=h1,h2   — only process these handles (for testing)
 *   BACKFILL_LIMIT=N         — stop after N products
 *
 * Run locally:
 *   pnpm --filter backend medusa exec backfill-ascolour-variants
 * Run on Fly:
 *   fly ssh console --app sc-prints-backend
 *   cd /app/.medusa/server && npx medusa exec src/scripts/backfill-ascolour-variants.js
 */

const PRICE_CURRENCY_CODE = "aud"
const AS_COLOUR_LOCATION_NAME = "AS Colour Warehouse"

const ladderToTierMinor = (ladder: PriceLadder): TierMoneyMinor => ({
  t1_9: Math.round(ladder.base * 100),
  t10_19: Math.round(ladder.tier10to19 * 100),
  t20_49: Math.round(ladder.tier20to49 * 100),
  t50_99: Math.round(ladder.tier50to99 * 100),
  t100_plus: Math.round(ladder.tier100Plus * 100),
})

const extractArray = <T,>(resp: any): T[] => {
  if (!resp) return []
  if (Array.isArray(resp)) return resp as T[]
  return resp.items ?? resp.data ?? resp.results ?? []
}

type ExistingProduct = {
  id: string
  handle: string
  metadata: { ascolour?: { styleCode?: string } } | null
  options: Array<{ id: string; title: string; values: Array<{ value: string }> }>
  variants: Array<{ id: string; sku: string | null }>
}

export default async function backfillAsColourVariants({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ascolour = container.resolve(ASCOLOUR_MODULE) as AsColourService
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION) as any

  const dryRun =
    process.env.BACKFILL_DRY_RUN === "1" || process.env.BACKFILL_DRY_RUN === "true"
  const handlesFilter = (process.env.BACKFILL_HANDLES ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
  const limit = process.env.BACKFILL_LIMIT
    ? Math.max(0, Number.parseInt(process.env.BACKFILL_LIMIT, 10) || 0)
    : undefined

  logger.info(`Mode: ${dryRun ? "DRY RUN (no DB writes)" : "APPLY"}`)
  if (handlesFilter.length) {
    logger.info(`Restricted to handles: ${handlesFilter.join(", ")}`)
  }
  if (limit) {
    logger.info(`Limit: ${limit} products`)
  }

  // 1. Resolve AS Colour warehouse stock location (needed for inventory seed)
  const existingLocations = await stockLocationService.listStockLocations({
    name: AS_COLOUR_LOCATION_NAME,
  })
  const asColourLocationId: string | null = existingLocations[0]?.id ?? null
  if (!asColourLocationId) {
    logger.warn(
      `${AS_COLOUR_LOCATION_NAME} not found — new variants will be created without inventory levels. Re-run the importer once to bootstrap the location.`
    )
  }

  // 2. List existing AS Colour products in our DB. Filter by handle prefix —
  // the importer's `handleForStyle` always yields "as-colour-..." so this is
  // a reliable scope.
  const { data: dbProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "metadata",
      "options.id",
      "options.title",
      "options.values.value",
      "variants.id",
      "variants.sku",
    ],
    filters: { handle: { $like: "as-colour-%" } },
  })

  const existingProducts = (dbProducts ?? []) as ExistingProduct[]
  logger.info(`Found ${existingProducts.length} AS Colour products in DB.`)

  // 3. Fetch the live AS Colour catalogue + pricelist
  logger.info("Fetching AS Colour catalogue + pricelist...")
  const apiProducts = await ascolour.fetchAllProducts()
  const priceList = await ascolour.fetchAllPriceList()
  const costBySku = new Map<string, number>()
  for (const entry of priceList) {
    const price = Number(entry.price)
    if (!entry.sku || !Number.isFinite(price)) continue
    const prev = costBySku.get(entry.sku)
    if (prev === undefined || price > prev) {
      costBySku.set(entry.sku, price)
    }
  }
  logger.info(
    `Got ${apiProducts.length} products + ${costBySku.size} pricelist entries from API.`
  )

  // Index API products by styleCode so we can pair them with DB products via
  // metadata.ascolour.styleCode.
  const apiByStyleCode = new Map<string, AsColourProduct>()
  for (const p of apiProducts) {
    if (p?.styleCode) apiByStyleCode.set(String(p.styleCode), p)
  }

  // 4. Walk each DB product, diff against API, create missing variants
  let processed = 0
  let totalMissing = 0
  let totalCreated = 0
  let productsWithChanges = 0
  let productsSkipped = 0

  for (const dbProduct of existingProducts) {
    if (limit && processed >= limit) break
    if (handlesFilter.length && !handlesFilter.includes(dbProduct.handle)) continue

    processed++

    const styleCode = dbProduct.metadata?.ascolour?.styleCode
    if (!styleCode) {
      logger.warn(
        `[${dbProduct.handle}] no metadata.ascolour.styleCode — can't pair with API. Skipping.`
      )
      productsSkipped++
      continue
    }

    const apiProduct = apiByStyleCode.get(String(styleCode))
    if (!apiProduct) {
      logger.warn(
        `[${dbProduct.handle}] styleCode ${styleCode} not in API response. Skipping (may have been discontinued).`
      )
      productsSkipped++
      continue
    }

    // ALWAYS hit the per-product variants endpoint. The catalog endpoint
    // sometimes returns a truncated inline variant array (observed empirically
    // on Staple Tee 5001 — catalog gave us the partial set our DB already
    // had, so an earlier version of this script reported 0 drift even though
    // 46 colours were missing).
    let apiVariants: AsColourVariant[]
    try {
      apiVariants = extractArray<AsColourVariant>(
        await ascolour.getClient().getProductVariants(String(styleCode))
      )
    } catch (err: any) {
      logger.warn(
        `[${dbProduct.handle}] failed to fetch variants for styleCode ${styleCode}: ${err?.message ?? err}`
      )
      productsSkipped++
      continue
    }

    const dbSkus = new Set(
      (dbProduct.variants ?? [])
        .map((v) => v.sku)
        .filter((sku): sku is string => typeof sku === "string" && sku.length > 0)
    )
    const missingVariants = apiVariants.filter(
      (v) => v.sku && !dbSkus.has(v.sku)
    )

    // One-line diagnostic per product so the run output shows which products
    // are in-sync vs which need backfill — without this you can't tell apart
    // "nothing to do" from "comparison broken".
    logger.info(
      `[${dbProduct.handle}] db=${dbSkus.size} api=${apiVariants.length} missing=${missingVariants.length}`
    )

    if (!missingVariants.length) {
      continue
    }

    totalMissing += missingVariants.length
    productsWithChanges++

    // Detect colour/size option ids on the DB product
    const colourOption = dbProduct.options.find((o) =>
      /colou?r/i.test(o.title ?? "")
    )
    const sizeOption = dbProduct.options.find((o) =>
      /size/i.test(o.title ?? "")
    )

    // Compute new option values (colours, sizes) we need to add to product
    // options before variant creation. Medusa rejects variants that reference
    // option values not yet on the parent product.
    const newColours = new Set<string>()
    const newSizes = new Set<string>()
    const existingColours = new Set(
      (colourOption?.values ?? []).map((v) => v.value)
    )
    const existingSizes = new Set(
      (sizeOption?.values ?? []).map((v) => v.value)
    )
    for (const v of missingVariants) {
      if (v.colour && colourOption && !existingColours.has(v.colour)) {
        newColours.add(v.colour)
      }
      if (v.sizeCode && sizeOption && !existingSizes.has(v.sizeCode)) {
        newSizes.add(v.sizeCode)
      }
    }

    if (newColours.size && colourOption) {
      logger.info(
        `[${dbProduct.handle}] adding ${newColours.size} new colour values: ${Array.from(newColours).join(", ")}`
      )
      if (!dryRun) {
        await updateProductOptionsWorkflow(container).run({
          input: {
            selector: { id: colourOption.id },
            update: {
              values: Array.from(
                new Set([...existingColours, ...newColours])
              ),
            },
          },
        })
      }
    }
    if (newSizes.size && sizeOption) {
      logger.info(
        `[${dbProduct.handle}] adding ${newSizes.size} new size values: ${Array.from(newSizes).join(", ")}`
      )
      if (!dryRun) {
        await updateProductOptionsWorkflow(container).run({
          input: {
            selector: { id: sizeOption.id },
            update: {
              values: Array.from(new Set([...existingSizes, ...newSizes])),
            },
          },
        })
      }
    }

    // Build variant create payloads — same shape as the importer so price
    // ladders, bulk_pricing metadata, and the cost_price_ex_gst_minor field
    // are consistent with everything the importer created previously.
    const variantPayloads: any[] = []
    const skuToSeed: string[] = []
    for (const v of missingVariants) {
      if (!v.sku) continue
      const variantOptions: Record<string, string> = {}
      if (colourOption && v.colour) variantOptions[colourOption.title] = v.colour
      if (sizeOption && v.sizeCode) variantOptions[sizeOption.title] = v.sizeCode

      const cost = costBySku.get(v.sku)
      const ladder = cost !== undefined ? buildPriceLadder(cost) : null
      const tierMinor = ladder ? ladderToTierMinor(ladder) : null
      const prices = tierMinor
        ? tierMinorToPriceSetRows(tierMinor, PRICE_CURRENCY_CODE)
        : [{ amount: 0, currency_code: PRICE_CURRENCY_CODE }]

      const titleParts = [v.colour, v.sizeCode].filter(Boolean)
      const variantTitle = titleParts.join(" / ") || v.name || v.sku

      variantPayloads.push({
        product_id: dbProduct.id,
        title: variantTitle,
        sku: v.sku,
        barcode: v.GTIN12 ?? undefined,
        manage_inventory: true,
        allow_backorder: false,
        options: variantOptions,
        prices,
        metadata: {
          ascolour: {
            styleCode: apiProduct.styleCode,
            sku: v.sku,
            colour: v.colour,
            sizeCode: v.sizeCode,
          },
          ...(tierMinor
            ? {
                bulk_pricing: tierMinorToBulkPricingMetadata(
                  tierMinor,
                  "ascolour-api-backfill"
                ),
              }
            : {}),
          ...(cost !== undefined
            ? { cost_price_ex_gst_minor: Math.round(cost * 100) }
            : {}),
          backfilled_at: new Date().toISOString(),
        },
      })
      skuToSeed.push(v.sku)
    }

    if (!variantPayloads.length) continue

    if (dryRun) {
      logger.info(
        `[${dbProduct.handle}] DRY RUN — would create ${variantPayloads.length} variants`
      )
      totalCreated += variantPayloads.length
      continue
    }

    try {
      await createProductVariantsWorkflow(container).run({
        input: { product_variants: variantPayloads },
      })
      totalCreated += variantPayloads.length
      logger.info(
        `[${dbProduct.handle}] created ${variantPayloads.length} variants`
      )
    } catch (err: any) {
      logger.warn(
        `[${dbProduct.handle}] variant creation failed: ${err?.message ?? err}`
      )
      continue
    }

    // Seed inventory at AS Colour warehouse for the SKUs we just created.
    if (!asColourLocationId || !skuToSeed.length) continue
    try {
      const { data: newInventoryItems } = await query.graph({
        entity: "inventory_item",
        fields: ["id", "sku"],
        filters: { sku: skuToSeed },
      })
      const itemsByLocationKey = new Set<string>()
      const { data: existingLevels } = await query.graph({
        entity: "inventory_level",
        fields: ["inventory_item_id", "location_id"],
        filters: {
          inventory_item_id: (newInventoryItems ?? []).map((i: any) => i.id),
        },
      })
      for (const lvl of existingLevels ?? []) {
        itemsByLocationKey.add(
          `${(lvl as any).inventory_item_id}:${(lvl as any).location_id}`
        )
      }

      const creates: {
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }[] = []
      for (const item of newInventoryItems ?? []) {
        const inventoryItemId = (item as any).id
        const key = `${inventoryItemId}:${asColourLocationId}`
        if (itemsByLocationKey.has(key)) continue
        creates.push({
          inventory_item_id: inventoryItemId,
          location_id: asColourLocationId,
          stocked_quantity: 0,
        })
      }
      if (creates.length) {
        await createInventoryLevelsWorkflow(container).run({
          input: { inventory_levels: creates },
        })
        logger.info(
          `[${dbProduct.handle}] seeded ${creates.length} inventory levels (0 qty — the hourly sync job will fill them).`
        )
      }
    } catch (err: any) {
      logger.warn(
        `[${dbProduct.handle}] inventory seed failed: ${err?.message ?? err}. Variants exist; the hourly sync will fill stock once it picks them up.`
      )
    }
  }

  logger.info(
    `Done. Processed ${processed} products, ${productsWithChanges} had drift, ${productsSkipped} skipped. ${totalCreated}/${totalMissing} variants ${dryRun ? "would be created" : "created"}.`
  )
}
