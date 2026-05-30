import { MedusaService } from "@medusajs/framework/utils"

import PrintProfile from "./models/print-profile"

class PrintProfileModuleService extends MedusaService({
  PrintProfile,
}) {}

export default PrintProfileModuleService
