import { ModuleProviderExports } from "@medusajs/framework/types"
import ShipStationProviderService from "./service"

const services = [ShipStationProviderService]

const providerExport: ModuleProviderExports = {
  services,
}

export default providerExport
