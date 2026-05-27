import { defineLink } from "@medusajs/framework/utils"

import OrganisationModule from "../modules/organisation"
import OrgInventoryModule from "../modules/org-inventory"

/**
 * One organisation_design has many inventory rows (one per garment
 * variant the design is applied to). `isList: true` on the design side.
 *
 * Materialised via `npx medusa db:sync-links` after this file lands.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → module links.
 */
export default defineLink(
  OrganisationModule.linkable.organisationDesign,
  {
    linkable: OrgInventoryModule.linkable.orgInventory,
    isList: true,
  }
)
