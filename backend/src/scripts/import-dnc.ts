/**
 * DNC Workwear catalogue import for Medusa 2.0
 *
 * Reads dnc_catalog.json (output of the Python scraper) and creates
 * Product Types, Categories, Tags, Collections, and Products in Medusa.
 *
 * Run:  npx medusa exec ./src/scripts/import-dnc.ts
 *
 * Idempotent: detects existing products by metadata.external_id and skips them,
 * so re-running after partial failure is safe.
 *
 * Configuration: edit IMPORT_CONFIG below.
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createProductTagsWorkflow,
  createProductTypesWorkflow,
} from "@medusajs/medusa/core-flows"
import * as fs from "fs"
import * as path from "path"

// ---------------------------------------------------------------------------
// CONFIGURATION — EDIT THESE TO MATCH YOUR STORE
// ---------------------------------------------------------------------------

const IMPORT_CONFIG = {
  // Path to the catalog JSON produced by the Python scraper.
  // Resolve relative to project root.
  catalogPath: "./dnc_catalog.json",

  // Wholesale → retail multiplier. 2.0 = 100% markup.
  // GST is included in retail (we treat the multiplied price as GST-inclusive).
  markupMultiplier: 2.0,

  // Currency for all prices.
  currencyCode: "aud",

  // Region to attach prices to. Will be looked up by name.
  // If your region is named differently, change this.
  regionName: "Australia",

  // Sales channel(s) to attach products to. Looked up by name.
  salesChannelNames: ["Default Sales Channel"],

  // Stock location to seed inventory at. Looked up by name (first match wins).
  // If undefined, inventory levels are skipped.
  stockLocationName: undefined as string | undefined,

  // Initial stocked quantity per variant. Set to 0 if you don't want
  // products to show as in-stock until you set real numbers.
  initialStock: 0,

  // Status products are imported as. "draft" lets you review before publishing.
  productStatus: ProductStatus.DRAFT,

  // Brand/supplier collection name. All DNC products go in this collection.
  // Use Collection for supplier, Categories for storefront browse.
  supplierCollectionName: "DNC Workwear",
  supplierHandle: "dnc-workwear",

  // Per-category markup overrides (optional). Keys are top-level categories.
  categoryMarkupOverrides: {
    // "Workwear": 1.8,
    // "Hi-Vis": 1.7,
  } as Record<string, number>,

  // Limit number of products to import (for testing). 0 = no limit.
  limit: 0,
}

// ---------------------------------------------------------------------------
// Catalog JSON shape (output of the Python scraper)
// ---------------------------------------------------------------------------

type CatalogVariant = {
  title: string
  sku: string
  barcode: string
  options: Record<string, string>
  wholesale_price_aud: number
  manage_inventory: boolean
}

type CatalogProduct = {
  external_id: string
  handle: string
  title: string
  subtitle: string
  description: string
  status: string
  type: string
  categories: string[][]
  tags: string[]
  images: string[]
  thumbnail: string
  options: { title: string; values: string[] }[]
  variants: CatalogVariant[]
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default async function importDncCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // -------------------------------------------------------------------------
  // 1. Load catalog file
  // -------------------------------------------------------------------------

  const catalogPath = path.resolve(process.cwd(), IMPORT_CONFIG.catalogPath)
  if (!fs.existsSync(catalogPath)) {
    throw new Error(
      `Catalog file not found at ${catalogPath}. ` +
      `Place dnc_catalog.json there or update IMPORT_CONFIG.catalogPath.`
    )
  }

  const catalog: CatalogProduct[] = JSON.parse(
    fs.readFileSync(catalogPath, "utf-8")
  )
  const catalogToImport = IMPORT_CONFIG.limit > 0
    ? catalog.slice(0, IMPORT_CONFIG.limit)
    : catalog

  logger.info(`Loaded catalog: ${catalog.length} products total, importing ${catalogToImport.length}`)

  // -------------------------------------------------------------------------
  // 2. Resolve dependencies (region, sales channel, stock location, etc.)
  // -------------------------------------------------------------------------

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code"],
    filters: { name: IMPORT_CONFIG.regionName },
  })
  if (!regions?.length) {
    throw new Error(
      `Region "${IMPORT_CONFIG.regionName}" not found. ` +
      `Create it in the Medusa admin first, or update IMPORT_CONFIG.regionName.`
    )
  }
  const region = regions[0]
  logger.info(`Using region: ${region.name} (${region.id})`)

  const { data: salesChannels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
    filters: { name: IMPORT_CONFIG.salesChannelNames },
  })
  if (!salesChannels?.length) {
    throw new Error(
      `No sales channels found with names: ${IMPORT_CONFIG.salesChannelNames.join(", ")}`
    )
  }
  logger.info(`Sales channels: ${salesChannels.map((s) => s.name).join(", ")}`)

  // Shipping profile — required on every product. Use the default.
  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id", "name", "type"],
    filters: { type: "default" },
  })
  if (!shippingProfiles?.length) {
    throw new Error(
      `No default shipping profile found. ` +
      `Make sure your store is fully seeded (run the default seed script first).`
    )
  }
  const shippingProfile = shippingProfiles[0]

  // Stock location (optional)
  let stockLocationId: string | undefined
  if (IMPORT_CONFIG.stockLocationName) {
    const { data: stockLocations } = await query.graph({
      entity: "stock_location",
      fields: ["id", "name"],
      filters: { name: IMPORT_CONFIG.stockLocationName },
    })
    if (stockLocations?.length) {
      stockLocationId = stockLocations[0].id
      logger.info(`Stock location: ${stockLocations[0].name}`)
    } else {
      logger.warn(
        `Stock location "${IMPORT_CONFIG.stockLocationName}" not found — skipping inventory levels`
      )
    }
  }

  // -------------------------------------------------------------------------
  // 3. Upsert taxonomy: Types, Tags, Categories, Collections
  // -------------------------------------------------------------------------

  // --- Product Types ---
  const uniqueTypes = [...new Set(catalogToImport.map((p) => p.type))]
  const typeMap = new Map<string, string>() // name -> id

  const { data: existingTypes } = await query.graph({
    entity: "product_type",
    fields: ["id", "value"],
    filters: { value: uniqueTypes },
  })
  for (const t of existingTypes || []) {
    typeMap.set(t.value, t.id)
  }
  const typesToCreate = uniqueTypes.filter((t) => !typeMap.has(t))
  if (typesToCreate.length) {
    const { result: created } = await createProductTypesWorkflow(container).run({
      input: { product_types: typesToCreate.map((value) => ({ value })) },
    })
    for (const t of created) typeMap.set(t.value, t.id)
    logger.info(`Created ${created.length} product types`)
  }
  logger.info(`Product types ready: ${typeMap.size}`)

  // --- Product Tags ---
  const uniqueTags = [...new Set(catalogToImport.flatMap((p) => p.tags))]
  const tagMap = new Map<string, string>()

  const { data: existingTags } = await query.graph({
    entity: "product_tag",
    fields: ["id", "value"],
    filters: { value: uniqueTags },
  })
  for (const t of existingTags || []) {
    tagMap.set(t.value, t.id)
  }
  const tagsToCreate = uniqueTags.filter((t) => !tagMap.has(t))
  if (tagsToCreate.length) {
    const { result: created } = await createProductTagsWorkflow(container).run({
      input: { product_tags: tagsToCreate.map((value) => ({ value })) },
    })
    for (const t of created) tagMap.set(t.value, t.id)
    logger.info(`Created ${created.length} product tags`)
  }
  logger.info(`Product tags ready: ${tagMap.size}`)

  // --- Categories (hierarchical) ---
  // Build the unique set of [parent, child] pairs from the catalog
  const categoryHierarchy = new Map<string, Set<string>>() // parent -> children
  for (const p of catalogToImport) {
    for (const path of p.categories) {
      if (!path.length) continue
      const parent = path[0]
      const child = path[1]
      if (!categoryHierarchy.has(parent)) {
        categoryHierarchy.set(parent, new Set())
      }
      if (child) categoryHierarchy.get(parent)!.add(child)
    }
  }

  const categoryMap = new Map<string, string>() // "Parent" or "Parent > Child" -> id

  // Look up existing categories by handle to avoid creating duplicates
  const allCategoryNames = [
    ...categoryHierarchy.keys(),
    ...[...categoryHierarchy.values()].flatMap((s) => [...s]),
  ]
  const { data: existingCats } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "handle", "parent_category_id"],
    filters: { handle: allCategoryNames.map((n) => slugify(n)) },
  })
  const handleToCat = new Map<string, { id: string; parent_category_id: string | null }>()
  for (const c of existingCats || []) {
    handleToCat.set(c.handle, { id: c.id, parent_category_id: c.parent_category_id })
  }

  // Create top-level (parent) categories first
  const parentCatsToCreate: { name: string; handle: string; is_active: boolean }[] = []
  for (const parent of categoryHierarchy.keys()) {
    if (!handleToCat.has(slugify(parent))) {
      parentCatsToCreate.push({ name: parent, handle: slugify(parent), is_active: true })
    }
  }
  if (parentCatsToCreate.length) {
    const { result: created } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: parentCatsToCreate },
    })
    for (const c of created) {
      handleToCat.set(c.handle, { id: c.id, parent_category_id: c.parent_category_id })
    }
    logger.info(`Created ${created.length} parent categories`)
  }
  for (const parent of categoryHierarchy.keys()) {
    categoryMap.set(parent, handleToCat.get(slugify(parent))!.id)
  }

  // Now create child categories with parent_category_id set
  const childCatsToCreate: {
    name: string
    handle: string
    is_active: boolean
    parent_category_id: string
  }[] = []
  for (const [parent, children] of categoryHierarchy.entries()) {
    const parentId = categoryMap.get(parent)!
    for (const child of children) {
      const handle = slugify(`${parent}-${child}`)
      if (!handleToCat.has(handle)) {
        childCatsToCreate.push({
          name: child,
          handle,
          is_active: true,
          parent_category_id: parentId,
        })
      } else {
        categoryMap.set(`${parent} > ${child}`, handleToCat.get(handle)!.id)
      }
    }
  }
  if (childCatsToCreate.length) {
    const { result: created } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: childCatsToCreate },
    })
    for (const c of created) {
      handleToCat.set(c.handle, { id: c.id, parent_category_id: c.parent_category_id })
    }
    logger.info(`Created ${created.length} child categories`)
  }
  for (const [parent, children] of categoryHierarchy.entries()) {
    for (const child of children) {
      const handle = slugify(`${parent}-${child}`)
      const cat = handleToCat.get(handle)
      if (cat) categoryMap.set(`${parent} > ${child}`, cat.id)
    }
  }
  logger.info(`Categories ready: ${categoryMap.size}`)

  // --- Supplier Collection ---
  let supplierCollectionId: string
  const { data: existingCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "title", "handle"],
    filters: { handle: IMPORT_CONFIG.supplierHandle },
  })
  if (existingCollections?.length) {
    supplierCollectionId = existingCollections[0].id
  } else {
    const { result: created } = await createCollectionsWorkflow(container).run({
      input: {
        collections: [
          {
            title: IMPORT_CONFIG.supplierCollectionName,
            handle: IMPORT_CONFIG.supplierHandle,
          },
        ],
      },
    })
    supplierCollectionId = created[0].id
    logger.info(`Created collection: ${IMPORT_CONFIG.supplierCollectionName}`)
  }

  // -------------------------------------------------------------------------
  // 4. Identify which products already exist (idempotency)
  // -------------------------------------------------------------------------

  const externalIds = catalogToImport.map((p) => p.external_id)
  const { data: existingProducts } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
  })
  const existingExternalIds = new Set(
    (existingProducts || [])
      .filter((p) => (p.metadata as any)?.external_id)
      .map((p) => (p.metadata as any).external_id as string)
  )

  const newProducts = catalogToImport.filter(
    (p) => !existingExternalIds.has(p.external_id)
  )
  const skippedCount = catalogToImport.length - newProducts.length
  if (skippedCount > 0) {
    logger.info(`Skipping ${skippedCount} products that already exist`)
  }
  if (!newProducts.length) {
    logger.info("Nothing to import.")
    return
  }
  logger.info(`Importing ${newProducts.length} new products...`)

  // -------------------------------------------------------------------------
  // 5. Build product input and create in batches
  // -------------------------------------------------------------------------

  const BATCH_SIZE = 25
  let totalCreated = 0
  let totalFailed = 0

  for (let i = 0; i < newProducts.length; i += BATCH_SIZE) {
    const batch = newProducts.slice(i, i + BATCH_SIZE)
    const inputProducts = batch.map((p) => buildProductInput(p, {
      typeMap,
      tagMap,
      categoryMap,
      supplierCollectionId,
      shippingProfileId: shippingProfile.id,
      salesChannelIds: salesChannels.map((s) => s.id),
    }))

    try {
      const { result } = await createProductsWorkflow(container).run({
        input: { products: inputProducts },
      })
      totalCreated += result.length
      logger.info(
        `[${Math.min(i + BATCH_SIZE, newProducts.length)}/${newProducts.length}] ` +
        `created ${result.length} products`
      )
    } catch (err: any) {
      totalFailed += batch.length
      logger.error(`Batch ${i / BATCH_SIZE + 1} failed: ${err.message}`)
      logger.error(`Affected codes: ${batch.map((p) => p.external_id).join(", ")}`)
      // Continue with the next batch instead of aborting
    }
  }

  logger.info(`Created ${totalCreated} products, ${totalFailed} failed`)

  // -------------------------------------------------------------------------
  // 6. Seed inventory levels (optional)
  // -------------------------------------------------------------------------

  if (stockLocationId && totalCreated > 0) {
    logger.info("Seeding inventory levels...")
    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id"],
    })
    if (inventoryItems?.length) {
      const inventoryLevels = inventoryItems.map((item) => ({
        location_id: stockLocationId!,
        inventory_item_id: item.id,
        stocked_quantity: IMPORT_CONFIG.initialStock,
      }))
      // Filter out levels that already exist to avoid duplicates on re-run
      const { data: existingLevels } = await query.graph({
        entity: "inventory_level",
        fields: ["inventory_item_id", "location_id"],
        filters: { location_id: stockLocationId },
      })
      const existingKeys = new Set(
        (existingLevels || []).map(
          (l) => `${l.inventory_item_id}|${l.location_id}`
        )
      )
      const newLevels = inventoryLevels.filter(
        (l) => !existingKeys.has(`${l.inventory_item_id}|${l.location_id}`)
      )
      if (newLevels.length) {
        await createInventoryLevelsWorkflow(container).run({
          input: { inventory_levels: newLevels },
        })
        logger.info(`Created ${newLevels.length} inventory levels`)
      } else {
        logger.info("No new inventory levels to create")
      }
    }
  }

  logger.info("DNC import complete.")
}

// ---------------------------------------------------------------------------
// Builds a single product input for createProductsWorkflow
// ---------------------------------------------------------------------------

function buildProductInput(
  p: CatalogProduct,
  ctx: {
    typeMap: Map<string, string>
    tagMap: Map<string, string>
    categoryMap: Map<string, string>
    supplierCollectionId: string
    shippingProfileId: string
    salesChannelIds: string[]
  }
) {
  // Map categories: full path "Parent > Child" if both, otherwise just parent.
  const categoryIds: string[] = []
  for (const path of p.categories || []) {
    if (!path.length) continue
    const key = path.length >= 2 ? `${path[0]} > ${path[1]}` : path[0]
    const id = ctx.categoryMap.get(key) || ctx.categoryMap.get(path[0])
    if (id && !categoryIds.includes(id)) categoryIds.push(id)
  }

  const tagIds = (p.tags || [])
    .map((t) => ctx.tagMap.get(t))
    .filter((id): id is string => !!id)

  const typeId = ctx.typeMap.get(p.type)

  // Determine markup. Per-category override beats the default.
  let multiplier = IMPORT_CONFIG.markupMultiplier
  for (const path of p.categories || []) {
    const override = IMPORT_CONFIG.categoryMarkupOverrides[path[0]]
    if (override !== undefined) {
      multiplier = override
      break
    }
  }

  const variants = p.variants.map((v) => {
    // Wholesale × multiplier, rounded to 2 decimals, then to cents.
    const retail = Math.round(v.wholesale_price_aud * multiplier * 100)
    return {
      title: v.title || `${v.options.Color || ""} / ${v.options.Size || ""}`.trim(),
      sku: v.sku,
      barcode: v.barcode || undefined,
      manage_inventory: v.manage_inventory,
      options: v.options,
      prices: [
        {
          amount: retail,
          currency_code: IMPORT_CONFIG.currencyCode,
        },
      ],
      metadata: {
        wholesale_price_aud: v.wholesale_price_aud,
        markup_multiplier: multiplier,
      },
    }
  })

  return {
    title: p.title,
    handle: p.handle,
    description: p.description,
    subtitle: p.subtitle || undefined,
    status: IMPORT_CONFIG.productStatus,
    type_id: typeId,
    tag_ids: tagIds,
    category_ids: categoryIds,
    collection_id: ctx.supplierCollectionId,
    shipping_profile_id: ctx.shippingProfileId,
    images: p.images.map((url) => ({ url })),
    thumbnail: p.thumbnail || p.images[0],
    options: p.options.map((o) => ({
      title: o.title,
      values: o.values,
    })),
    variants,
    sales_channels: ctx.salesChannelIds.map((id) => ({ id })),
    metadata: {
      ...p.metadata,
      external_id: p.external_id,
    },
  }
}
