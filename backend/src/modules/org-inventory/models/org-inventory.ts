import { model } from "@medusajs/framework/utils"

/**
 * One row per `(organisation, product_variant, design)` triple we hold
 * stock for OR print on demand for. The triple is the orderable SKU —
 * "Logo White × LifeGrain S" is a distinct inventory row from
 * "Logo Black × LifeGrain S".
 *
 * `quantity_on_hand` + `quantity_reserved` are cached aggregates of
 * `org_inventory_movement` rows. The OrgInventoryService is the single
 * mutation gateway — every change writes a movement row AND updates
 * these aggregates transactionally.
 *
 * `fulfillment_mode`:
 *   - "held_stock" — we hold physical inventory. Order decrements;
 *     reorder_point matters; customer sees "In stock: N".
 *   - "print_on_demand" — we don't hold stock. Order auto-creates a
 *     print task referencing the design's print_file_url.
 *
 * `unit_price` + `unit_cost` are stored in cents (integer). When passing
 * to Medusa's createOrderWorkflow, divide by 100 — POS does the same.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → data model § 3.
 */
const OrgInventory = model
  .define("org_inventory", {
    id: model.id({ prefix: "orginv" }).primaryKey(),

    organisation_id: model.text(),
    product_variant_id: model.text(),
    organisation_design_id: model.text(),

    fulfillment_mode: model
      .enum(["held_stock", "print_on_demand"])
      .default("held_stock"),

    // Cents, integer. Divide by 100 at createOrderWorkflow boundary.
    unit_price: model.number(),
    unit_cost: model.number(),

    // Cached aggregates. held_stock only — always 0 for PoD rows.
    quantity_on_hand: model.number().default(0),
    quantity_reserved: model.number().default(0),

    reorder_point: model.number().nullable(),
    reorder_quantity: model.number().nullable(),

    // Customer-facing lead time for print_on_demand rows.
    lead_time_days: model.number().nullable(),

    // Optional per-row label override. Falls back to variant.title at
    // render time.
    customer_facing_label: model.text().nullable(),

    is_active: model.boolean().default(true),
    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["organisation_id"] },
    { on: ["product_variant_id"] },
    { on: ["organisation_design_id"] },
    { on: ["organisation_id", "is_active"] },
  ])

export default OrgInventory
