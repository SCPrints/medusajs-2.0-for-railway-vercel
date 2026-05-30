import { Module } from "@medusajs/framework/utils"

import PrintProfileModuleService from "./service"

export const PRINT_PROFILE_MODULE = "print_profile"

export default Module(PRINT_PROFILE_MODULE, {
  service: PrintProfileModuleService,
})
