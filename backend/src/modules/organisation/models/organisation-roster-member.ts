import { model } from "@medusajs/framework/utils"

/**
 * A person on an organisation's roster ("People"): who gets a garment, in
 * which size, in which unit / team. NOT a login — organisation_member is the
 * customer account link; a roster can list 200 players who never sign in.
 *
 * `sizes` is keyed by the garment groups in lib/roster.ts
 * (`{ tops: "L", bottoms: "34", headwear: "OSFA" }`).
 */
const OrganisationRosterMember = model
  .define("organisation_roster_member", {
    id: model.id({ prefix: "orgrm" }).primaryKey(),
    organisation_id: model.text(),
    name: model.text(),
    unit: model.text().nullable(),
    number: model.text().nullable(),
    sizes: model.json().default({}),
    notes: model.text().nullable(),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["organisation_id"] }])

export default OrganisationRosterMember
