import { InventoryEvents, PricingEvents, search } from "@medusajs/framework/utils"
import {
  defineProductSearchIndex,
  parseEventName,
  PRODUCT_EVENTS,
  PRODUCT_GRAPH_FIELDS,
  reconcileIds,
  resolveEventIds,
  resolveRelatedIds,
} from "@rokmohar/medusa-plugin-meilisearch/indexes"
import {
  PRODUCT_DOCUMENT_GRAPH_FIELDS,
  toProductSearchDocument,
} from "../lib/search-product-document"

/**
 * The `products` Meilisearch index, kept full by Medusa's Search Module.
 *
 * The storefront and the Job pricer query Meili directly, so the document
 * shape and settings match the old v1 plugin index exactly. The module builds
 * each version under its own name (`products_v1`, `products_v2`, …) and swaps
 * it in when seeded — readers resolve the live name via `GET /store/search-index`.
 */

const filters = { status: "published" }
const graphFields = [...new Set([...PRODUCT_GRAPH_FIELDS, ...PRODUCT_DOCUMENT_GRAPH_FIELDS])]

const transform = (product: any) => ({
  ...toProductSearchDocument(product),
  id: String(product.id),
  status: product.status,
  sales_channel_ids: (product.sales_channels || []).map((c: any) => c?.id).filter(Boolean),
})

// Price and stock events change `min_price_aud` / `in_stock`, which the
// plugin's default routing doesn't cover. Option events are dropped: options
// aren't indexed, and the plugin's option lookup reads `product_option.product_id`,
// which Medusa 2.17 removed.
const EVENTS = [
  ...PRODUCT_EVENTS.filter((e) => !e.includes("product-option") && !e.includes("product_option")),
  "price.created", "price.updated", "price.deleted",
  PricingEvents.PRICE_CREATED, PricingEvents.PRICE_UPDATED, PricingEvents.PRICE_DELETED,
  "inventory-item.created", "inventory-item.updated", "inventory-item.deleted",
  InventoryEvents.INVENTORY_ITEM_CREATED, InventoryEvents.INVENTORY_ITEM_UPDATED, InventoryEvents.INVENTORY_ITEM_DELETED,
  "inventory-level.created", "inventory-level.updated", "inventory-level.deleted",
  InventoryEvents.INVENTORY_LEVEL_CREATED, InventoryEvents.INVENTORY_LEVEL_UPDATED, InventoryEvents.INVENTORY_LEVEL_DELETED,
]

const reconcileOptions = {
  name: "products",
  entity: "product",
  graphFields,
  filters,
  transform,
}

async function productIdsFor(query: any, entity: string, ids: string[], deleted: boolean): Promise<string[]> {
  const related = (e: string, field: string, f: Record<string, unknown>, withDeleted = false) =>
    resolveRelatedIds(query, { entity: e, field, filters: f, withDeleted })
  const fromVariants = async (variantIds: string[]) =>
    variantIds.length ? related("product_variant", "product_id", { id: variantIds }, true) : []

  switch (entity) {
    case "product-variant":
      return fromVariants(ids)
    case "price": {
      const sets = await related("price", "price_set_id", { id: ids }, deleted)
      if (!sets.length) return []
      return fromVariants(await related("product_variant_price_set", "variant_id", { price_set_id: sets }))
    }
    case "inventory-level": {
      const items = await related("inventory_level", "inventory_item_id", { id: ids }, deleted)
      if (!items.length) return []
      return fromVariants(await related("product_variant_inventory_item", "variant_id", { inventory_item_id: items }))
    }
    case "inventory-item":
      return fromVariants(await related("product_variant_inventory_item", "variant_id", { inventory_item_id: ids }, deleted))
  }
  if (deleted) return []
  switch (entity) {
    case "product-category":
      return related("product", "id", { categories: { id: ids } })
    case "product-collection":
      return related("product", "id", { collection_id: ids })
    case "product-tag":
      return related("product", "id", { tags: { id: ids } })
    case "product-type":
      return related("product", "id", { type_id: ids })
  }
  return []
}

export default defineProductSearchIndex({
  fields: search.define({
    id: search.keyword().filterable(),
    status: search.keyword().filterable(),
    handle: search.keyword().filterable(),
    title: search.text().searchable({ weight: 5 }).sortable(),
    // brand_name right after title so "biz hoodie" ranks the brand's hoodies.
    brand_name: search.text().searchable({ weight: 4 }).filterable(),
    description: search.text().searchable({ weight: 3 }),
    variant_sku: search.text().searchable({ weight: 2 }),
    material_text: search.text().searchable({ weight: 1 }),
    thumbnail: search.keyword().retrievable(),
    created_at_ts: search.integer().sortable(),
    min_price_aud: search.integer().filterable().sortable(),
    category_ids: search.keyword().filterable().array(),
    collection_id: search.keyword().filterable(),
    type_id: search.keyword().filterable(),
    tag_ids: search.keyword().filterable().array(),
    brand_handle: search.keyword().filterable(),
    fabric: search.keyword().filterable().array(),
    in_stock: search.boolean().filterable(),
    internal_service: search.boolean().filterable(),
    sales_channel_ids: search.keyword().filterable().array(),
  }),
  graph_fields: PRODUCT_DOCUMENT_GRAPH_FIELDS,
  filters,
  transform,
  events: EVENTS,
  consume: async (event: any, context: any) => {
    const ids = resolveEventIds(event)
    if (!ids.length) return []
    const { entity, action } = parseEventName(event.name)
    const query = context.container.query
    if (entity === "product") {
      if (action === "deleted") return [{ action: "delete", filters: { id: ids } }]
      return reconcileIds(query, reconcileOptions as any, ids, context)
    }
    const productIds = await productIdsFor(query, entity, ids, action === "deleted")
    return reconcileIds(query, reconcileOptions as any, productIds, context)
  },
  settings: {
    provider_options: {
      meilisearch: {
        displayedAttributes: ["id", "handle", "title", "description", "variant_sku", "thumbnail"],
        // Default maxTotalHits (1000) capped listing pagination on the 1300+
        // product store-wide listing.
        pagination: { maxTotalHits: 5000 },
      },
    },
  },
})
