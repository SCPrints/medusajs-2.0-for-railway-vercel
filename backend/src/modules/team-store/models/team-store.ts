import { model } from "@medusajs/framework/utils"

/**
 * A branded pre-order store for a club, school or company
 * (Docs/TEAM_STORES_SPEC.md). Buyers pay for their own items; the store's
 * orders print as one run when it closes. Orders are NOT stored here: each
 * cart line / order carries `metadata.team_store_id`.
 */
const TeamStore = model
  .define("team_store", {
    id: model.id({ prefix: "tstore" }).primaryKey(),
    organisation_id: model.text(),
    handle: model.text(),
    title: model.text(),
    intro: model.text().nullable(),
    banner_url: model.text().nullable(),
    accent_colour: model.text().nullable(),
    status: model
      .enum(["draft", "awaiting_approval", "open", "closed", "in_production", "completed", "cancelled"])
      .default("draft"),
    opens_at: model.dateTime().nullable(),
    closes_at: model.dateTime(),
    password_hash: model.text().nullable(),
    delivery_mode: model.enum(["bulk", "individual"]).default("bulk"),
    delivery_destination_id: model.text().nullable(),
    expected_quantity: model.number().default(0),
    minimum_quantity: model.number().nullable(),
    approved_at: model.dateTime().nullable(),
    approved_by_name: model.text().nullable(),
    /** The production-run job (a `team_store` quote), created at close. */
    quote_id: model.text().nullable(),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["handle"], unique: true },
    { on: ["organisation_id"] },
    { on: ["status"] },
  ])

export default TeamStore
