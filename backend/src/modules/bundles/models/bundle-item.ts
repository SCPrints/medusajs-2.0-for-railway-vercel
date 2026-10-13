import { model } from "@medusajs/framework/utils"

const BundleItem = model
  .define("bundle_item", {
    id: model.id({ prefix: "bndi" }).primaryKey(),
    bundle_id: model.text(),
    product_handle: model.text(),
    label: model.text(),
    quantity_per_unit: model.number().default(1),
    decoration_type: model.text().default("embroidery"),
    position: model.number().default(0),
    /**
     * `{ positions: BundlePrintPosition[] }` — where and how each garment is
     * decorated (side + print size, or side + stitch count). Drives the
     * server-side price. Null = derive a default from `decoration_type`.
     */
    print_positions: model.json().nullable(),
    /**
     * `{ options: [{ label, product_handle }] }` — garments the customer may
     * pick between for this item (e.g. Mens / Womens). `product_handle` stays
     * the default choice. Null/empty = no choice.
     */
    choices: model.json().nullable(),
  })
  .indexes([
    { on: ["bundle_id"] },
    { on: ["bundle_id", "position"] },
  ])

export default BundleItem
