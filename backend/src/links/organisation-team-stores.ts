import { defineLink } from "@medusajs/framework/utils"

import OrganisationModule from "../modules/organisation"
import TeamStoreModule from "../modules/team-store"

/** One organisation has many team stores (`organisation_id` is also on the row). */
export default defineLink(OrganisationModule.linkable.organisation, {
  linkable: TeamStoreModule.linkable.teamStore,
  isList: true,
})
