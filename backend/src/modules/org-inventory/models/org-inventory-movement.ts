import { model } from "@medusajs/framework/utils"

/**
 * Append-only ledger of every stock change on an `org_inventory` row.
 *
 * The OrgInventoryService writes a movement row AND updates the cached
 * aggregates (`quantity_on_hand`, `quantity_reserved`) on its parent
 * `org_inventory` row inside a single transaction. The aggregates are
 * always recomputable from this log — periodic reconciliation jobs in
 * Phase 4 verify they haven't drifted.
 *
 * `reason` semantics:
 *   - reservation:    +qty to reserved          (order placed)
 *   - shipment:       -qty from on_hand AND -qty from reserved
 *                     (order shipped — releases the reservation
 *                      AND decrements physical stock)
 *   - release:        -qty from reserved        (order cancelled)
 *   - receipt:        +qty to on_hand           (print run arrived)
 *   - adjustment_up:  +qty to on_hand           (stocktake found extra)
 *   - adjustment_down:-qty from on_hand         (stocktake found less)
 *   - transfer_in:    +qty to on_hand           (future)
 *   - transfer_out:   -qty from on_hand         (future)
 *
 * `qty_delta` is the signed effect on the running total relevant to the
 * reason. For reservations/releases it affects `reserved`. For
 * receipts/shipments/adjustments it affects `on_hand`. The shipment
 * reason is special — it affects BOTH on_hand AND reserved by the same
 * absolute quantity.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → data model § 4.
 */
const OrgInventoryMovement = model
  .define("org_inventory_movement", {
    id: model.id({ prefix: "orginvmov" }).primaryKey(),

    org_inventory_id: model.text(),

    qty_delta: model.number(),

    reason: model.enum([
      "receipt",
      "shipment",
      "reservation",
      "release",
      "adjustment_up",
      "adjustment_down",
      "transfer_in",
      "transfer_out",
    ]),

    reference_type: model
      .enum(["order", "print_run", "stocktake", "manual"])
      .nullable(),
    reference_id: model.text().nullable(),

    notes: model.text().nullable(),
    created_by: model.text().nullable(),

    metadata: model.json().default({}),
  })
  .indexes([
    { on: ["org_inventory_id"] },
    { on: ["org_inventory_id", "created_at"] },
    { on: ["reference_type", "reference_id"] },
  ])

export default OrgInventoryMovement
