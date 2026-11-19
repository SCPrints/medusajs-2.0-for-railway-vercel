import { model } from "@medusajs/framework/utils"

/** A cost centre an organisation's orders are tagged with (`order.metadata.cost_centre` = code). */
const OrganisationCostCentre = model
  .define("organisation_cost_centre", {
    id: model.id({ prefix: "orgcc" }).primaryKey(),
    organisation_id: model.text(),
    code: model.text(),
    name: model.text(),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["organisation_id"] }])

export default OrganisationCostCentre
