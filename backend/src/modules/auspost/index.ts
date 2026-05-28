import { ModuleProviderExports } from "@medusajs/framework/types"
import AusPostProviderService from "./service"

const services = [AusPostProviderService]

const providerExport: ModuleProviderExports = {
  services,
}

export default providerExport
