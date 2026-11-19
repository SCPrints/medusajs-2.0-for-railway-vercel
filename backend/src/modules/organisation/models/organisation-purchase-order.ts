import { model } from "@medusajs/framework/utils"

/**
 * A blanket purchase order: the organisation commits `amount` (AUD inc GST)
 * and orders draw on it (`order.metadata.organisation_po_id`). What's left is
 * computed from the orders, never stored (lib/org-account.ts → poRemaining).
 */
const OrganisationPurchaseOrder = model
  .define("organisation_purchase_order", {
    id: model.id({ prefix: "orgpo" }).primaryKey(),
    organisation_id: model.text(),
    number: model.text(),
    amount: model.bigNumber(),
    expires_at: model.dateTime().nullable(),
    is_active: model.boolean().default(true),
  })
  .indexes([{ on: ["organisation_id"] }])

export default OrganisationPurchaseOrder
