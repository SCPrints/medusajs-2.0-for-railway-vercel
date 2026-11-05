import { model } from "@medusajs/framework/utils"

/**
 * One flat measurement of one size of a product, in cm, for the internal 3D
 * garment builder (never shown to customers). Keys and garment types live in
 * src/lib/garment-measurements.ts. `product_id` is denormalised for the
 * per-product read; a Module Link adds `product.garment_measurements`.
 */
const GarmentMeasurement = model
  .define("garment_measurement", {
    id: model.id({ prefix: "gmeas" }).primaryKey(),
    product_id: model.text(),
    garment_type: model.text(),
    size: model.text(),
    key: model.text(),
    value_cm: model.float(),
    /** Filled in from other sizes, not taped. Re-measuring clears it. */
    estimated: model.boolean().default(false),
    note: model.text().nullable(),
    /** Admin user id. */
    measured_by: model.text().nullable(),
    measured_at: model.dateTime(),
  })
  .indexes([
    { on: ["product_id"] },
    { on: ["product_id", "size", "key"], unique: true },
  ])

export default GarmentMeasurement
