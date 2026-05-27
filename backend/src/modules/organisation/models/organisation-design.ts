import { model } from "@medusajs/framework/utils"

/**
 * Pre-approved brand artwork belonging to an organisation. One org
 * typically has ~8 designs (e.g. "Lifegrain Logo White") that can be
 * applied across multiple garment types via separate `org_inventory`
 * rows.
 *
 * Distinct from the customer-scoped `designs` module (which powers the
 * `/account/designs` saved-design library for customizer users). Org
 * designs have different ownership, lifecycle, and access — staff
 * manages them; members of the org consume them.
 *
 * `print_file_url` is the production-ready artwork. Stamped onto print
 * tasks so the operator knows exactly what to print without needing to
 * re-render anything.
 *
 * `customizer_metadata` is the optional Fabric.js JSON. Phase 1 doesn't
 * use it (designs are fully locked artwork — no re-edit flow). Storing
 * it now means a future portal preview can render an accurate on-garment
 * mockup from the same data the customizer would produce.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → "Resolved decisions Q7-Q9".
 */
const OrganisationDesign = model
  .define("organisation_design", {
    id: model.id({ prefix: "orgdsn" }).primaryKey(),
    organisation_id: model.text(),

    name: model.text(),
    code: model.text().nullable(),

    thumbnail_url: model.text(),
    print_file_url: model.text().nullable(),

    customizer_metadata: model.json().nullable(),

    is_active: model.boolean().default(true),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["organisation_id", "is_active"] },
  ])

export default OrganisationDesign
