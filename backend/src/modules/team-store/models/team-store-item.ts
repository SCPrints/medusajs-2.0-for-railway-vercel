import { model } from "@medusajs/framework/utils"

/**
 * One garment + colour in a team store, designed once by staff in the
 * Studio. Products are referenced by handle (like bundles) so the item
 * survives supplier re-imports.
 */
const TeamStoreItem = model
  .define("team_store_item", {
    id: model.id({ prefix: "tsitem" }).primaryKey(),
    team_store_id: model.text(),
    product_handle: model.text(),
    colour: model.text(),
    /** `{ sizes: string[] }` — subset of the garment's sizes; null = all. */
    allowed_sizes: model.json().nullable(),
    /** CustomizerMetadata from the Studio; sideLayouts archived to R2 on write. */
    customizer_design: model.json().nullable(),
    /** `{ <side>: ScpPrintSizeId }` — for production and the suggested price. */
    print_size_ids: model.json().nullable(),
    /** Inc GST, dollars (major units). */
    unit_price: model.bigNumber().nullable(),
    unit_cost_estimate: model.bigNumber().nullable(),
    weight: model.number().default(0),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["team_store_id"] }])

export default TeamStoreItem
