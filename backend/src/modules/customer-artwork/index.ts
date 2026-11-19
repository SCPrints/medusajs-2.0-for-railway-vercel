import { Module } from "@medusajs/framework/utils"

import CustomerArtworkModuleService from "./service"

export const CUSTOMER_ARTWORK_MODULE = "customer_artwork"

export default Module(CUSTOMER_ARTWORK_MODULE, {
  service: CustomerArtworkModuleService,
})
