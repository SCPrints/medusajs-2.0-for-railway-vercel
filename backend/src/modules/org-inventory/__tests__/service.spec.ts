/**
 * Unit tests for OrgInventoryModuleService — the mutation gateway.
 *
 * We mock the inherited MedusaService auto-generated methods so we
 * can verify each public operation writes the right movement row and
 * applies the right aggregate change without booting a real DB.
 *
 * Critical invariants:
 *   - reserve  → +qty_delta reservation,    aggregate: +reserved
 *   - ship     → -qty_delta shipment,       aggregate: -on_hand, -reserved
 *   - release  → -qty_delta release,        aggregate: -reserved
 *   - receive  → +qty_delta receipt,        aggregate: +on_hand
 *   - adjust   → ±delta adjustment_*,       aggregate: ±on_hand
 *   - adjust no-op when target == current
 */
import OrgInventoryModuleService from "../service"

type Row = {
  id: string
  quantity_on_hand: number
  quantity_reserved: number
}

const buildService = (initial: Row) => {
  const state: Row = { ...initial }
  const movements: any[] = []

  const svc = Object.create(OrgInventoryModuleService.prototype)

  svc.retrieveOrgInventory = jest.fn(async (id: string) => {
    if (id !== state.id) throw new Error("not found")
    return { ...state }
  })

  svc.updateOrgInventories = jest.fn(async (updates: any[]) => {
    for (const u of updates) {
      if (u.id !== state.id) continue
      if (typeof u.quantity_on_hand === "number") {
        state.quantity_on_hand = u.quantity_on_hand
      }
      if (typeof u.quantity_reserved === "number") {
        state.quantity_reserved = u.quantity_reserved
      }
    }
    return updates
  })

  svc.createOrgInventoryMovements = jest.fn(async (rows: any[]) => {
    const created = rows.map((r) => ({ id: `mov_${movements.length + 1}`, ...r }))
    movements.push(...created)
    return created
  })

  return { svc, state, movements }
}

describe("OrgInventoryModuleService", () => {
  it("reserve(): writes a reservation movement and bumps quantity_reserved", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 50,
      quantity_reserved: 0,
    })

    await svc.reserve({
      org_inventory_id: "orginv_1",
      quantity: 10,
      order_id: "order_x",
    })

    expect(movements).toHaveLength(1)
    expect(movements[0].reason).toBe("reservation")
    expect(movements[0].qty_delta).toBe(10)
    expect(movements[0].reference_type).toBe("order")
    expect(movements[0].reference_id).toBe("order_x")
    expect(state.quantity_on_hand).toBe(50)
    expect(state.quantity_reserved).toBe(10)
  })

  it("ship(): writes a shipment movement and decrements both on_hand and reserved", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 50,
      quantity_reserved: 10,
    })

    await svc.ship({
      org_inventory_id: "orginv_1",
      quantity: 10,
      order_id: "order_x",
    })

    expect(movements).toHaveLength(1)
    expect(movements[0].reason).toBe("shipment")
    expect(movements[0].qty_delta).toBe(-10)
    expect(state.quantity_on_hand).toBe(40)
    expect(state.quantity_reserved).toBe(0)
  })

  it("release(): writes a release movement and decrements quantity_reserved only", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 50,
      quantity_reserved: 10,
    })

    await svc.release({
      org_inventory_id: "orginv_1",
      quantity: 10,
      order_id: "order_x",
    })

    expect(movements).toHaveLength(1)
    expect(movements[0].reason).toBe("release")
    expect(movements[0].qty_delta).toBe(-10)
    expect(state.quantity_on_hand).toBe(50)
    expect(state.quantity_reserved).toBe(0)
  })

  it("receive(): writes a receipt movement and bumps quantity_on_hand", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 10,
      quantity_reserved: 0,
    })

    await svc.receive({
      org_inventory_id: "orginv_1",
      quantity: 60,
      print_run_task_id: "task_abc",
    })

    expect(movements).toHaveLength(1)
    expect(movements[0].reason).toBe("receipt")
    expect(movements[0].qty_delta).toBe(60)
    expect(movements[0].reference_type).toBe("print_run")
    expect(movements[0].reference_id).toBe("task_abc")
    expect(state.quantity_on_hand).toBe(70)
    expect(state.quantity_reserved).toBe(0)
  })

  it("receive() with no print_run_task_id labels the movement as manual", async () => {
    const { svc, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 0,
      quantity_reserved: 0,
    })

    await svc.receive({ org_inventory_id: "orginv_1", quantity: 5 })

    expect(movements[0].reference_type).toBe("manual")
    expect(movements[0].reference_id).toBeNull()
  })

  it("adjust(): writes adjustment_up when target > current", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 20,
      quantity_reserved: 0,
    })

    await svc.adjust({ org_inventory_id: "orginv_1", target_quantity: 25 })

    expect(movements).toHaveLength(1)
    expect(movements[0].reason).toBe("adjustment_up")
    expect(movements[0].qty_delta).toBe(5)
    expect(state.quantity_on_hand).toBe(25)
  })

  it("adjust(): writes adjustment_down when target < current", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 20,
      quantity_reserved: 0,
    })

    await svc.adjust({ org_inventory_id: "orginv_1", target_quantity: 12 })

    expect(movements).toHaveLength(1)
    expect(movements[0].reason).toBe("adjustment_down")
    expect(movements[0].qty_delta).toBe(-8)
    expect(state.quantity_on_hand).toBe(12)
  })

  it("adjust(): no-op when target equals current", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 20,
      quantity_reserved: 0,
    })

    const result = await svc.adjust({
      org_inventory_id: "orginv_1",
      target_quantity: 20,
    })

    expect(result).toBeNull()
    expect(movements).toHaveLength(0)
    expect(state.quantity_on_hand).toBe(20)
  })

  it("over-allocation: reserve > on_hand is permitted (negative effective availability)", async () => {
    const { svc, state, movements } = buildService({
      id: "orginv_1",
      quantity_on_hand: 15,
      quantity_reserved: 0,
    })

    await svc.reserve({
      org_inventory_id: "orginv_1",
      quantity: 20,
      order_id: "order_x",
    })

    expect(movements[0].reason).toBe("reservation")
    expect(state.quantity_reserved).toBe(20)
    // Effective availability is now negative — the fulfillment subscriber
    // creates a print task for the deficit.
    expect(state.quantity_on_hand - state.quantity_reserved).toBe(-5)
  })

  it("rejects non-positive quantity on reserve/ship/release/receive", async () => {
    const { svc } = buildService({
      id: "orginv_1",
      quantity_on_hand: 50,
      quantity_reserved: 0,
    })

    await expect(
      svc.reserve({ org_inventory_id: "orginv_1", quantity: 0, order_id: "x" })
    ).rejects.toThrow(/positive/)
    await expect(
      svc.ship({ org_inventory_id: "orginv_1", quantity: -5, order_id: "x" })
    ).rejects.toThrow(/positive/)
    await expect(
      svc.release({ org_inventory_id: "orginv_1", quantity: 0, order_id: "x" })
    ).rejects.toThrow(/positive/)
    await expect(
      svc.receive({ org_inventory_id: "orginv_1", quantity: -1 })
    ).rejects.toThrow(/positive/)
  })

  it("getAvailability(): returns on_hand - reserved", async () => {
    const { svc } = buildService({
      id: "orginv_1",
      quantity_on_hand: 50,
      quantity_reserved: 20,
    })

    const avail = await svc.getAvailability("orginv_1")
    expect(avail.on_hand).toBe(50)
    expect(avail.reserved).toBe(20)
    expect(avail.available).toBe(30)
  })
})
