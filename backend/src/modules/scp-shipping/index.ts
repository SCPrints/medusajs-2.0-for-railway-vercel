import { ModuleProviderExports } from "@medusajs/framework/types"
import ScpShippingProviderService from "./service"

const services = [ScpShippingProviderService]

const providerExport: ModuleProviderExports = {
  services,
}

export default providerExport
