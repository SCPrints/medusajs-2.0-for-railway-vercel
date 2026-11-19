import {
  bucketByCostCentre,
  bucketByMonth,
  buildSpendReport,
  costCentreLabel,
  monthKey,
  paymentStatus,
  statementCsvRows,
  statementRows,
  toSpendOrder,
  type SpendOrder,
} from "../spend-report"

const NOW = new Date("2026-11-19T02:00:00Z")
const order = (over: Partial<SpendOrder>): SpendOrder => ({
  id: "order_1", display_id: "1", created_at: "2026-11-05T00:00:00Z", currency_code: "aud", total: 100, paid: 100, po_number: null, cost_centre: null, ...over,
})

describe("toSpendOrder", () => {
  it("reads the current total and paid from the summary", () => {
    expect(
      toSpendOrder({
        id: "order_1", display_id: 78, created_at: "2026-09-01T00:00:00Z", currency_code: "AUD", total: 9999,
        summary: { current_order_total: 2844, paid_total: "2844" },
        metadata: { po_number: " PO-77 ", cost_centre: "Depot" },
      })
    ).toEqual({ id: "order_1", display_id: "78", created_at: "2026-09-01T00:00:00.000Z", currency_code: "aud", total: 2844, paid: 2844, po_number: "PO-77", cost_centre: "Depot" })
  })
  it("drops cancelled and draft orders", () => {
    expect(toSpendOrder({ id: "o", created_at: "2026-09-01", canceled_at: "2026-09-02" })).toBeNull()
    expect(toSpendOrder({ id: "o", created_at: "2026-09-01", status: "draft" })).toBeNull()
  })
  it("falls back to the fulfilment order's external ref for the PO", () => {
    expect(toSpendOrder({ id: "o", created_at: "2026-09-01", metadata: { external_ref: "REQ-9" } })?.po_number).toBe("REQ-9")
  })
})

describe("costCentreLabel", () => {
  it("takes text or a named object", () => {
    expect(costCentreLabel(" Depot ")).toBe("Depot")
    expect(costCentreLabel({ id: "cc_1", name: "Workshop" })).toBe("Workshop")
    expect(costCentreLabel(undefined)).toBeNull()
  })
})

describe("paymentStatus", () => {
  it.each([
    [100, 100, "paid"],
    [100, 99.995, "paid"],
    [100, 40, "part_paid"],
    [100, 0, "outstanding"],
    [0, 168.3, "refunded"],
    [0, 0, "paid"],
  ])("total %s paid %s → %s", (total, paid, status) => expect(paymentStatus(total, paid)).toBe(status))
})

describe("months", () => {
  it("keys by Sydney month (late UTC on the 30th is already the 1st in Sydney)", () => {
    expect(monthKey("2026-10-31T14:30:00Z")).toBe("2026-11")
    expect(monthKey("2026-10-31T10:00:00Z")).toBe("2026-10")
  })
  it("returns 24 zero-filled months, oldest first, ending this month", () => {
    const b = bucketByMonth([order({}), order({ id: "o2", created_at: "2026-11-10T00:00:00Z", total: 50 }), order({ id: "o3", created_at: "2025-01-15T00:00:00Z" })], NOW)
    expect(b).toHaveLength(24)
    expect(b[0]).toMatchObject({ month: "2024-12", label: "Dec 2024", total: 0 })
    expect(b[23]).toEqual({ month: "2026-11", label: "Nov 2026", total: 150, orders: 2 })
    expect(b.find((x) => x.month === "2025-01")?.total).toBe(100)
  })
})

describe("cost centres", () => {
  it("is empty when no order has one", () => expect(bucketByCostCentre([order({})])).toEqual([]))
  it("groups, biggest first, with a bucket for untagged orders", () => {
    expect(
      bucketByCostCentre([order({ cost_centre: "Depot", total: 10 }), order({ cost_centre: "Office", total: 300 }), order({ total: 5 }), order({ cost_centre: "Depot", total: 20 })])
    ).toEqual([
      { cost_centre: "Office", total: 300, orders: 1 },
      { cost_centre: "Depot", total: 30, orders: 2 },
      { cost_centre: "No cost centre", total: 5, orders: 1 },
    ])
  })
})

describe("statement", () => {
  const orders = [
    order({ id: "a", display_id: "10", created_at: "2026-10-01T00:00:00Z", total: 200, paid: 50, po_number: "PO-1" }),
    order({ id: "b", display_id: "11", created_at: "2026-11-01T00:00:00Z", total: 100, paid: 100 }),
    order({ id: "old", display_id: "2", created_at: "2023-01-01T00:00:00Z", total: 999, paid: 0 }),
  ]
  it("lists newest first with what is owing", () => {
    const rows = statementRows(orders.slice(0, 2))
    expect(rows.map((r) => r.display_id)).toEqual(["11", "10"])
    expect(rows[1]).toMatchObject({ total: 200, paid: 50, outstanding: 150, status: "part_paid", status_label: "Part paid" })
  })
  it("totals only the report window", () => {
    const report = buildSpendReport(orders, NOW)
    expect(report.totals).toEqual({ spend: 300, paid: 150, outstanding: 150, orders: 2 })
    expect(report.statement).toHaveLength(2)
  })
  it("makes CSV rows with a totals line", () => {
    const rows = statementCsvRows(buildSpendReport(orders, NOW))
    expect(rows[0][0]).toBe("Date")
    expect(rows[2]).toEqual(["01/10/2026", "#10", "PO-1", "", "200.00", "50.00", "150.00", "Part paid"])
    expect(rows[rows.length - 1]).toEqual(["Total", "", "", "", "300.00", "150.00", "150.00", ""])
  })
})
