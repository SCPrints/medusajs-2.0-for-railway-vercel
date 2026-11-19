import { MedusaService } from "@medusajs/framework/utils"

import CustomerArtwork from "./models/customer-artwork"

class CustomerArtworkModuleService extends MedusaService({
  CustomerArtwork,
}) {}

export default CustomerArtworkModuleService
