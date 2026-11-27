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
    expect(fields).toContain("items.metadata")
  })

  it("with pg, reads line metadata in SQL without the Studio drawings", async () => {
    const graph = jest.fn().mockResolvedValue({
      data: [{ id: "a", items: [{ id: "l1" }, { id: "l2" }] }, { id: "b", items: [] }],
    })
    const raw = jest.fn().mockResolvedValue({
      rows: [{ id: "l1", metadata: { customizerDesign: { prints: [] } } }],
    })
    const orders = await fetchOrdersForReports({ graph }, { pg: { raw } })

    expect(graph.mock.calls[0][0].fields).not.toContain("items.metadata")
    expect(raw.mock.calls[0][0]).toContain("#- '{customizerDesign,sideLayouts}'")
    expect(raw.mock.calls[0][1]).toEqual([["l1", "l2"]])
    // A line SQL didn't return reads as no metadata, as query.graph gives it.
    expect(orders[0].items.map((i: any) => i.metadata)).toEqual([
      { customizerDesign: { prints: [] } },
      null,
    ])
  })

  it("with pg, callers that arrive together share one load, frozen, in their own lists", async () => {
    const graph = jest.fn().mockResolvedValue({
      data: [{ id: "a", items: [{ id: "l1" }] }, { id: "b", items: [] }],
    })
    const raw = jest.fn().mockResolvedValue({ rows: [{ id: "l1", metadata: { x: 1 } }] })
    const query = { graph }
    const [one, two] = await Promise.all([
      fetchOrdersForReports(query, { pg: { raw } }),
      fetchOrdersForReports(query, { pg: { raw } }),
    ])

    expect(graph).toHaveBeenCalledTimes(1)
    expect(raw).toHaveBeenCalledTimes(1)
    one.reverse()
    expect(two.map((o) => o.id)).toEqual(["a", "b"])
    expect(() => {
      two[0].total = 5
    }).toThrow(TypeError)
    expect(() => {
      two[0].items[0].metadata = null
    }).toThrow(TypeError)
  })
})
