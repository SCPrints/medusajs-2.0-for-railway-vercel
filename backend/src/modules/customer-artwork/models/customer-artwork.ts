import { model } from "@medusajs/framework/utils"

/**
 * A logo / artwork file in a customer's library ("Your artwork"). The file
 * itself lives on our object storage (R2); this row is the pointer plus a
 * friendly name. `source = "order"` rows are imported lazily from the
 * customer's past orders (`customizerDesign.customerOriginalFiles`).
 * Deleting hides the row (`hidden_at`) so the lazy import doesn't bring it back.
 */
const CustomerArtwork = model
  .define("customer_artwork", {
    id: model.id({ prefix: "cuart" }).primaryKey(),
    customer_id: model.text(),
    organisation_id: model.text().nullable(),
    name: model.text(),
    url: model.text(),
    mime_type: model.text(),
    thumbnail_url: model.text().nullable(),
    source: model.enum(["upload", "order"]).default("upload"),
    source_order_id: model.text().nullable(),
    hidden_at: model.dateTime().nullable(),
  })
  .indexes([
    { on: ["customer_id"] },
    { on: ["organisation_id"] },
    { on: ["customer_id", "url"], unique: true },
  ])

export default CustomerArtwork
