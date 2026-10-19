import {
  INVENTORY_GUARD,
  chunk,
  planInventoryLevelWrites,
  shouldAbortInventoryWrite,
} from "../inventory-level-writes"

const loc = "sloc_supplier"

describe("planInventoryLevelWrites", () => {
  it("creates missing levels, updates changed ones, skips unchanged", () => {
    const plan = planInventoryLevelWrites({
      items: [
        { id: "ii_new", sku: "NEW" },
        { id: "ii_same", sku: "SAME" },
        { id: "ii_changed", sku: "CHANGED" },
        { id: "ii_unknown_sku", sku: "NOT_IN_PLAN" },
      ],
      existingLevels: [
        { inventory_item_id: "ii_same", stocked_quantity: 10 },
        { inventory_item_id: "ii_changed", stocked_quantity: 5 },
        { inventory_item_id: "ii_unknown_sku", stocked_quantity: 0 },
      ],
      stockBySku: new Map([
        ["NEW", 3],
        ["SAME", 10],
        ["CHANGED", 7],
      ]),
      locationId: loc,
    })
    expect(plan.creates).toEqual([{ inventory_item_id: "ii_new", location_id: loc, stocked_quantity: 3 }])
    expect(plan.updates).toEqual([{ inventory_item_id: "ii_changed", location_id: loc, stocked_quantity: 7 }])
    // unknown-SKU row: plan says 0, existing is 0 → unchanged, not rewritten
    expect(plan.unchanged).toBe(2)
    expect(plan.rowsConsidered).toBe(3)
    expect(plan.existingSum).toBe(15)
    expect(plan.newSum).toBe(17)
    expect(plan.rowsBecomingZero).toBe(1)
  })

  it("reads undecorated graph quantities (string / {value}) and treats NaN as 0", () => {
    const plan = planInventoryLevelWrites({
      items: [
        { id: "a", sku: "A" },
        { id: "b", sku: "B" },
      ],
      existingLevels: [
        { inventory_item_id: "a", stocked_quantity: "12" },
        { inventory_item_id: "b", stocked_quantity: { value: "4" } },
      ],
      stockBySku: new Map([
        ["A", 12],
        ["B", Number.NaN],
      ]),
      locationId: loc,
    })
    expect(plan.unchanged).toBe(1)
    expect(plan.updates).toEqual([{ inventory_item_id: "b", location_id: loc, stocked_quantity: 0 }])
  })
})

describe("shouldAbortInventoryWrite", () => {
  const base = { rowsConsidered: 100, existingSum: 1000, newSum: 950, rowsBecomingZero: 5 }

  it("passes ordinary stock movement", () => {
    expect(shouldAbortInventoryWrite(base)).toEqual({ abort: false })
  })

  it("aborts when the new sum drops below 50% of the existing sum", () => {
    const v = shouldAbortInventoryWrite({ ...base, newSum: 499 })
    expect(v.abort).toBe(true)
    expect(v.abort && v.reason).toMatch(/below 50%/)
  })

  it("aborts when more than 90% of rows would become zero", () => {
    // sum rule can't see this: one big row keeps the total up
    const v = shouldAbortInventoryWrite({ ...base, newSum: 900, rowsBecomingZero: 91 })
    expect(v.abort).toBe(true)
    expect(v.abort && v.reason).toMatch(/91 of 100 rows/)
  })

  it("ignores small populations (a few sell-outs in a delta) and empty existing stock", () => {
    expect(
      shouldAbortInventoryWrite({ rowsConsidered: INVENTORY_GUARD.minRows - 1, existingSum: 500, newSum: 0, rowsBecomingZero: 19 })
    ).toEqual({ abort: false })
    expect(
      shouldAbortInventoryWrite({ rowsConsidered: 500, existingSum: 0, newSum: 0, rowsBecomingZero: 500 })
    ).toEqual({ abort: false })
  })

  it("a legitimate full-catalog refresh with the same totals passes", () => {
    expect(
      shouldAbortInventoryWrite({ rowsConsidered: 11000, existingSum: 240000, newSum: 238500, rowsBecomingZero: 1200 })
    ).toEqual({ abort: false })
  })
})

describe("chunk", () => {
  it("splits at 250 by default and keeps order", () => {
    const rows = Array.from({ length: 601 }, (_, i) => i)
    const out = chunk(rows)
    expect(out.map((c) => c.length)).toEqual([250, 250, 101])
    expect(out[2][0]).toBe(500)
    expect(chunk([])).toEqual([])
  })
})
