import { Module } from "@medusajs/framework/utils"
import AsColourService from "./service"

export const ASCOLOUR_MODULE = "ascolour"

export default Module(ASCOLOUR_MODULE, {
  service: AsColourService,
})

export { AsColourService }
export * from "./types"
