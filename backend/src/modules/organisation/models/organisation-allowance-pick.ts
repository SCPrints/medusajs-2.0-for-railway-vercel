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
    /** Home delivery only: where this person's pack goes (lib/home-delivery.ts). */
    address: model.json().nullable(),
    /** Ongoing allowances: the cart this person's pack went into (double-add guard). */
    cart_id: model.text().nullable(),
  })
  .indexes([{ on: ["token"], unique: true }, { on: ["allowance_id"] }])

export default OrganisationAllowancePick
