import { MedusaService } from "@medusajs/framework/utils"

import Organisation from "./models/organisation"
import OrganisationDesign from "./models/organisation-design"
import OrganisationDestination from "./models/organisation-destination"
import OrganisationMember from "./models/organisation-member"

class OrganisationModuleService extends MedusaService({
  Organisation,
  OrganisationMember,
  OrganisationDesign,
  OrganisationDestination,
}) {}

export default OrganisationModuleService
