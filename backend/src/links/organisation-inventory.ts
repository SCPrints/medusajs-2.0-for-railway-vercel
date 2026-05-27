import { defineLink } from "@medusajs/framework/utils"

import OrganisationModule from "../modules/organisation"
import OrgInventoryModule from "../modules/org-inventory"

/**
 * One organisation has many inventory rows. `isList: true` on the org side.
 *
 * Materialised via `npx medusa db:sync-links` after this file lands.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → module links.
 */
export default defineLink(
  OrganisationModule.linkable.organisation,
  {
    linkable: OrgInventoryModule.linkable.orgInventory,
    isList: true,
  }
)
