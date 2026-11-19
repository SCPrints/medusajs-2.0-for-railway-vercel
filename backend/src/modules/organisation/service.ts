import { MedusaService } from "@medusajs/framework/utils"

import Organisation from "./models/organisation"
import OrganisationCart from "./models/organisation-cart"
import OrganisationCostCentre from "./models/organisation-cost-centre"
import OrganisationDesign from "./models/organisation-design"
import OrganisationDestination from "./models/organisation-destination"
import OrganisationMember from "./models/organisation-member"
import OrganisationPurchaseOrder from "./models/organisation-purchase-order"
import OrganisationRosterMember from "./models/organisation-roster-member"

class OrganisationModuleService extends MedusaService({
  Organisation,
  OrganisationMember,
  OrganisationDesign,
  OrganisationDestination,
  OrganisationPurchaseOrder,
  OrganisationCostCentre,
  OrganisationCart,
  OrganisationRosterMember,
}) {}

export default OrganisationModuleService
