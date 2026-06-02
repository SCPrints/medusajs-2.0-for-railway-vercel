import { Module } from "@medusajs/framework/utils"
import HomeSectionModuleService from "./service"

export const HOME_SECTION_MODULE = "home_section"

export default Module(HOME_SECTION_MODULE, {
  service: HomeSectionModuleService,
})
