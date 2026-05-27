import { Module } from "@medusajs/framework/utils"

import OrgInventoryModuleService from "./service"

export const ORG_INVENTORY_MODULE = "org_inventory"

export default Module(ORG_INVENTORY_MODULE, {
  service: OrgInventoryModuleService,
})
