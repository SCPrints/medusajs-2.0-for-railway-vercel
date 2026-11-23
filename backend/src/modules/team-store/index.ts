import { Module } from "@medusajs/framework/utils"

import TeamStoreModuleService from "./service"

export const TEAM_STORE_MODULE = "team_store"

export default Module(TEAM_STORE_MODULE, {
  service: TeamStoreModuleService,
})
