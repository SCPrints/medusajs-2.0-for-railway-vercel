import { quoteLinesMissingFromOrder } from "../quote-order-lines"

describe("quoteLinesMissingFromOrder", () => {
  it("finds shipping added after conversion on an order with no quote_line_id links (order #126)", () => {
    const lines = [
      { id: "a", title: "DTF Setup", quantity: 1, unit_price: 30 },
      { id: "b", title: "DTF Gangsheet Pirate 1m", quantity: 1, unit_price: 50 }, // renamed after conversion
      { id: "c", title: "Shipping", quantity: 1, unit_price: 15 },
    ]
    const items = [
      { title: "DTF Setup", quantity: 1, unit_price: 30, metadata: {} },
      { title: "DTF Gangsheet Pirate", quantity: 1, unit_price: { numeric: 50 }, metadata: {} },
    ]
    expect(quoteLinesMissingFromOrder(lines, items).map((l) => l.id)).toEqual(["c"])
  })

  it("matches by quote_line_id exactly, so a same-priced new line still counts as new", () => {
    const lines = [
      { id: "a", title: "Setup", quantity: 1, unit_price: 30 },
      { id: "b", title: "Rush fee", quantity: 1, unit_price: 30 },
    ]
    const items = [{ title: "Setup", quantity: 1, unit_price: 30, metadata: { quote_line_id: "a" } }]
    expect(quoteLinesMissingFromOrder(lines, items).map((l) => l.id)).toEqual(["b"])
  })

  it("treats a legacy design group split by Enter sizes as on the order", () => {
    const lines = [{ id: "a", title: "Tee", quantity: 20, unit_price: 25, group_id: "g1" }]
    const items = [
      { title: "Tee", variant_id: "v_m", quantity: 10, unit_price: 25, metadata: { group_id: "g1" } },
      { title: "Tee", variant_id: "v_l", quantity: 10, unit_price: 25, metadata: { group_id: "g1" } },
    ]
    expect(quoteLinesMissingFromOrder(lines, items)).toEqual([])
  })

  it("each legacy order line matches only one quote line", () => {
    const lines = [
      { id: "a", title: "Setup", quantity: 1, unit_price: 30 },
      { id: "b", title: "Setup", quantity: 1, unit_price: 30 },
    ]
    const items = [{ title: "Setup", quantity: 1, unit_price: 30, metadata: {} }]
    expect(quoteLinesMissingFromOrder(lines, items).map((l) => l.id)).toEqual(["b"])
  })

  it("ignores blank and zero-quantity lines", () => {
    const lines = [
      { id: "a", title: "", quantity: 1, unit_price: 5 },
      { id: "b", title: "Thing", quantity: 0, unit_price: 5 },
    ]
    expect(quoteLinesMissingFromOrder(lines, [])).toEqual([])
  })
})
