import { model } from "@medusajs/framework/utils"

/**
 * A cart parked with an organisation: a named draft any owner/purchaser can
 * open and finish, or an order waiting for an owner's approval. One table
 * for both (features 2 + 18). `approved_total` is what the owner approved;
 * a cart that grew past it needs approving again.
 */
const OrganisationCart = model
  .define("organisation_cart", {
    id: model.id({ prefix: "orgcart" }).primaryKey(),
    organisation_id: model.text(),
    cart_id: model.text(),
    name: model.text(),
    created_by: model.text(),
    status: model
      .enum(["draft", "awaiting_approval", "approved", "declined", "ordered"])
      .default("draft"),
    cost_centre: model.text().nullable(),
    note: model.text().nullable(),
    decided_by: model.text().nullable(),
    decided_at: model.dateTime().nullable(),
    decline_reason: model.text().nullable(),
    approved_total: model.bigNumber().nullable(),
    order_id: model.text().nullable(),
  })
  .indexes([
    { on: ["organisation_id", "status"] },
    { on: ["cart_id"], unique: true },
  ])

export default OrganisationCart
