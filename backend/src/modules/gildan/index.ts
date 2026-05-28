import { Module } from "@medusajs/framework/utils"
import GildanService from "./service"

export const GILDAN_MODULE = "gildan"

export default Module(GILDAN_MODULE, {
  service: GildanService,
})

export { GildanService }
export * from "./types"
