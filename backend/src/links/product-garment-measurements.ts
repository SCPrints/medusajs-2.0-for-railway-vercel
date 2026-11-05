import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"

import GarmentMeasurementModule from "../modules/garment-measurement"

/** One product has many garment measurements (per size, per key). */
export default defineLink(ProductModule.linkable.product, {
  linkable: GarmentMeasurementModule.linkable.garmentMeasurement,
  isList: true,
})
