import { MedusaService } from "@medusajs/framework/utils"

import TeamStore from "./models/team-store"
import TeamStoreItem from "./models/team-store-item"

class TeamStoreModuleService extends MedusaService({
  TeamStore,
  TeamStoreItem,
}) {}

export default TeamStoreModuleService
