import { MedusaService } from "@medusajs/framework/utils"

import OrgInventory from "./models/org-inventory"
import OrgInventoryMovement from "./models/org-inventory-movement"

export type MovementReason =
  | "receipt"
  | "shipment"
  | "reservation"
  | "release"
  | "adjustment_up"
  | "adjustment_down"
  | "transfer_in"
  | "transfer_out"

export type ReferenceType = "order" | "print_run" | "stocktake" | "manual"

type AggregateChange = {
  on_hand_delta?: number
  reserved_delta?: number
}

type WriteMovementArgs = {
  org_inventory_id: string
  qty_delta: number
  reason: MovementReason
  reference_type?: ReferenceType | null
  reference_id?: string | null
  notes?: string | null
  created_by?: string | null
  metadata?: Record<string, unknown>
}

type ReserveArgs = {
  org_inventory_id: string
  quantity: number
  order_id: string
  actor_id?: string | null
  notes?: string | null
}

type ShipArgs = ReserveArgs
type ReleaseArgs = ReserveArgs

type ReceiveArgs = {
  org_inventory_id: string
  quantity: number
  print_run_task_id?: string | null
  notes?: string | null
  actor_id?: string | null
}

type AdjustArgs = {
  org_inventory_id: string
  target_quantity: number
  notes?: string | null
  actor_id?: string | null
}

/**
 * OrgInventoryService is the single mutation gateway for the
 * `org_inventory` + `org_inventory_movement` tables.
 *
 * Every mutation method writes a movement row AND updates the cached
 * aggregates (`quantity_on_hand`, `quantity_reserved`) on the parent
 * inventory row in the same call. The aggregates are always
 * recomputable from the movement log.
 *
 * Auto-generated MedusaService methods are still available for read
 * paths and admin CRUD (createOrgInventories, listOrgInventories, etc.).
 * Never call those to mutate `quantity_on_hand` or `quantity_reserved`
 * directly — always go through reserve / ship / release / receive /
 * adjust.
 *
 * See Docs/FULFILLMENT_PHASE_1_SPEC.md → service layer.
 */
class OrgInventoryModuleService extends MedusaService({
  OrgInventory,
  OrgInventoryMovement,
}) {
  private async applyAggregate(
    inventoryId: string,
    change: AggregateChange
  ): Promise<void> {
    const onHandDelta = change.on_hand_delta ?? 0
    const reservedDelta = change.reserved_delta ?? 0
    if (onHandDelta === 0 && reservedDelta === 0) return

    const row = await this.retrieveOrgInventory(inventoryId)
    const nextOnHand = (row.quantity_on_hand ?? 0) + onHandDelta
    const nextReserved = (row.quantity_reserved ?? 0) + reservedDelta
    await this.updateOrgInventories([
      {
        id: inventoryId,
        quantity_on_hand: nextOnHand,
        quantity_reserved: nextReserved,
      } as any,
    ])
  }

  /**
   * Internal write — writes a movement row + applies an aggregate
   * change. Used by the public reserve/ship/release/receive/adjust
   * helpers below.
   */
  private async writeMovement(
    args: WriteMovementArgs,
    aggregate: AggregateChange
  ): Promise<any> {
    const [movement] = await this.createOrgInventoryMovements([
      {
        org_inventory_id: args.org_inventory_id,
        qty_delta: args.qty_delta,
        reason: args.reason,
        reference_type: args.reference_type ?? null,
        reference_id: args.reference_id ?? null,
        notes: args.notes ?? null,
        created_by: args.created_by ?? null,
        metadata: args.metadata ?? {},
      },
    ])
    await this.applyAggregate(args.org_inventory_id, aggregate)
    return movement
  }

  /**
   * Reserve stock against an open order. Increments
   * quantity_reserved. May exceed quantity_on_hand — over-allocation
   * is allowed and triggers an auto-print task downstream (see
   * fulfillment-on-order-placed subscriber).
   */
  async reserve(args: ReserveArgs): Promise<any> {
    if (args.quantity <= 0) throw new Error("quantity must be positive")
    return this.writeMovement(
      {
        org_inventory_id: args.org_inventory_id,
        qty_delta: args.quantity,
        reason: "reservation",
        reference_type: "order",
        reference_id: args.order_id,
        notes: args.notes ?? null,
        created_by: args.actor_id ?? null,
      },
      { reserved_delta: args.quantity }
    )
  }

  /**
   * Ship stock. Releases the reservation AND decrements physical
   * stock — both effects in one movement row. Triggered by the
   * `order.shipment_created` subscriber.
   */
  async ship(args: ShipArgs): Promise<any> {
    if (args.quantity <= 0) throw new Error("quantity must be positive")
    return this.writeMovement(
      {
        org_inventory_id: args.org_inventory_id,
        qty_delta: -args.quantity,
        reason: "shipment",
        reference_type: "order",
        reference_id: args.order_id,
        notes: args.notes ?? null,
        created_by: args.actor_id ?? null,
      },
      {
        on_hand_delta: -args.quantity,
        reserved_delta: -args.quantity,
      }
    )
  }

  /**
   * Release a reservation without shipping. Used when an order is
   * cancelled.
   */
  async release(args: ReleaseArgs): Promise<any> {
    if (args.quantity <= 0) throw new Error("quantity must be positive")
    return this.writeMovement(
      {
        org_inventory_id: args.org_inventory_id,
        qty_delta: -args.quantity,
        reason: "release",
        reference_type: "order",
        reference_id: args.order_id,
        notes: args.notes ?? null,
        created_by: args.actor_id ?? null,
      },
      { reserved_delta: -args.quantity }
    )
  }

  /**
   * Receive stock from a completed print run. Increments
   * quantity_on_hand. If reservations were over-allocated (negative
   * effective availability), they're now backed.
   */
  async receive(args: ReceiveArgs): Promise<any> {
    if (args.quantity <= 0) throw new Error("quantity must be positive")
    return this.writeMovement(
      {
        org_inventory_id: args.org_inventory_id,
        qty_delta: args.quantity,
        reason: "receipt",
        reference_type: args.print_run_task_id ? "print_run" : "manual",
        reference_id: args.print_run_task_id ?? null,
        notes: args.notes ?? null,
        created_by: args.actor_id ?? null,
      },
      { on_hand_delta: args.quantity }
    )
  }

  /**
   * Stocktake reconciliation. Sets quantity_on_hand to a target by
   * writing a single adjustment movement equal to the delta.
   */
  async adjust(args: AdjustArgs): Promise<any> {
    const row = await this.retrieveOrgInventory(args.org_inventory_id)
    const current = row.quantity_on_hand ?? 0
    const delta = args.target_quantity - current
    if (delta === 0) {
      return null // No-op
    }
    const reason: MovementReason =
      delta > 0 ? "adjustment_up" : "adjustment_down"
    return this.writeMovement(
      {
        org_inventory_id: args.org_inventory_id,
        qty_delta: delta,
        reason,
        reference_type: "stocktake",
        reference_id: null,
        notes: args.notes ?? null,
        created_by: args.actor_id ?? null,
      },
      { on_hand_delta: delta }
    )
  }

  /**
   * Convenience read — returns effective availability for a row.
   */
  async getAvailability(
    org_inventory_id: string
  ): Promise<{ on_hand: number; reserved: number; available: number }> {
    const row = await this.retrieveOrgInventory(org_inventory_id)
    const on_hand = row.quantity_on_hand ?? 0
    const reserved = row.quantity_reserved ?? 0
    return { on_hand, reserved, available: on_hand - reserved }
  }
}

export default OrgInventoryModuleService
