import { model } from "@medusajs/framework/utils"

/**
 * A specific ship-to address in an organisation's store network
 * (e.g. "Lifegrain Sutherland Hospital", "Plume Randwick").
 *
 * One org has many destinations. Fulfillment orders snapshot the
 * destination's address fields onto the Medusa order's shipping_address
 * at order-creation time.
 *
 * `is_active` soft-delete is used because orders reference destinations
 * historically — hard-deleting would orphan order metadata. Inactive
 * destinations don't appear in admin pickers.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → data model § 2.
 */
const OrganisationDestination = model
  .define("organisation_destination", {
    id: model.id({ prefix: "orgdest" }).primaryKey(),
    organisation_id: model.text(),

    name: model.text(),
    code: model.text().nullable(),

    address_1: model.text(),
    address_2: model.text().nullable(),
    city: model.text(),
    province: model.text().nullable(),
    postal_code: model.text(),
    country_code: model.text().default("au"),

    contact_name: model.text().nullable(),
    contact_phone: model.text().nullable(),
    contact_email: model.text().nullable(),

    // Free-form: gate code, opening hours, "leave at side door", etc.
    // Shown on packing slip + label downstream.
    delivery_notes: model.text().nullable(),

    is_active: model.boolean().default(true),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["organisation_id", "is_active"] },
  ])

export default OrganisationDestination
