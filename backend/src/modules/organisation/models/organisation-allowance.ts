import { model } from "@medusajs/framework/utils"

/**
 * A uniform allowance: "each person gets these items". `items` is
 * `[{ design_id, per_person }]` (designs from the organisation's range).
 * `unit` null = everyone on the roster. `cart_id` set = already added to a
 * cart (the allowance is then closed; also the double-add guard).
 */
const OrganisationAllowance = model
  .define("organisation_allowance", {
    id: model.id({ prefix: "orgal" }).primaryKey(),
    organisation_id: model.text(),
    name: model.text(),
    unit: model.text().nullable(),
    closes_at: model.dateTime().nullable(),
    status: model.enum(["open", "closed"]).default("open"),
    items: model.json().default([] as unknown as Record<string, unknown>),
    cart_id: model.text().nullable(),
    created_by: model.text(),
  })
  .indexes([{ on: ["organisation_id"] }])

export default OrganisationAllowance
