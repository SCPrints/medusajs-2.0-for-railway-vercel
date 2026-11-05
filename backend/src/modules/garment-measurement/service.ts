import { MedusaService } from "@medusajs/framework/utils"

import GarmentMeasurement from "./models/garment-measurement"

class GarmentMeasurementModuleService extends MedusaService({
  GarmentMeasurement,
}) {}

export default GarmentMeasurementModuleService
