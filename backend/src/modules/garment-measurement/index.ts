import { Module } from "@medusajs/framework/utils"

import GarmentMeasurementModuleService from "./service"

export const GARMENT_MEASUREMENT_MODULE = "garment_measurement"

export default Module(GARMENT_MEASUREMENT_MODULE, {
  service: GarmentMeasurementModuleService,
})
