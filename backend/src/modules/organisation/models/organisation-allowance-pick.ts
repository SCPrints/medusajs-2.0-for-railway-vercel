import { model } from "@medusajs/framework/utils"

/**
 * One roster person's private link (`token`) and what they picked:
 * `picks` = `[{ design_id, size, quantity }]`. `submitted_at` null = not yet.
 */
const OrganisationAllowancePick = model
  .define("organisation_allowance_pick", {
    id: model.id({ prefix: "orgalp" }).primaryKey(),
    allowance_id: model.text(),
    roster_member_id: model.text(),
    token: model.text(),
    picks: model.json().default([] as unknown as Record<string, unknown>),
    submitted_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["token"], unique: true }, { on: ["allowance_id"] }])

export default OrganisationAllowancePick
