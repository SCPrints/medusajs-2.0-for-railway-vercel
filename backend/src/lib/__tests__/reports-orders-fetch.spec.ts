import { fetchOrdersForReports } from "../reports/orders"

describe("fetchOrdersForReports", () => {
  it("requests item detail + summary and overrides total with summary.current_order_total", async () => {
    const graph = jest.fn().mockResolvedValue({
      data: [
        { id: "a", total: 15, summary: { current_order_total: 238.28 }, items: [] },
        { id: "b", total: 11, summary: {}, items: [] },
        { id: "c", total: 0, items: [] },
      ],
    })
    const orders = await fetchOrdersForReports({ graph })

    const fields: string[] = graph.mock.calls[0][0].fields
    expect(fields).toContain("items.detail.quantity")
    expect(fields).toContain("summary.*")
    expect(orders.map((o) => o.total)).toEqual([238.28, 11, 0])
  })
})
