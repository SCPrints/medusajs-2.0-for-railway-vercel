import { mostRepeatedOrder, pickReminder, type ReminderOrder } from "../reorder-reminder-rules"

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 21)
const item = (product: string, qty = 10, design = true) => ({
  id: `li_${product}`, title: product, product_title: product, variant_id: "v", product_id: product, quantity: qty,
  metadata: design ? { customizerDesign: { x: 1 }, source_design_id: `d_${product}` } : {},
})
const order = (id: string, daysAgo: number, items = [item("tee")], stage: string | null = "delivered"): ReminderOrder => ({
  id, display_id: 1, created_at: NOW - daysAgo * DAY, stage, items,
})

describe("pickReminder", () => {
  const three = [order("a", 300), order("b", 200), order("c", 100)] // gap 100, 100 days since last

  it("fires inside the customer's own window and lists what they ordered", () => {
    const p = pickReminder({ orders: three, now: NOW })
    expect(p?.trigger).toBe("pattern")
    expect(p?.median_gap_days).toBe(100)
    expect(p?.lines).toEqual([{ title: "tee", quantity: 10, thumbnail: null }])
  })
  it("waits when it is too early or too late", () => {
    expect(pickReminder({ orders: [order("a", 300), order("b", 200), order("c", 50)], now: NOW })).toBeNull()
    expect(pickReminder({ orders: [order("a", 600), order("b", 500), order("c", 300)], now: NOW })).toBeNull()
  })
  it("skips open orders, carts and quotes", () => {
    expect(pickReminder({ orders: [...three, order("d", 5, [item("tee")], "in_production")], now: NOW })).toBeNull()
    expect(pickReminder({ orders: three, now: NOW, hasOpenCart: true })).toBeNull()
    expect(pickReminder({ orders: three, now: NOW, hasOpenQuote: true })).toBeNull()
  })
  it("never reminds twice inside 60 days", () => {
    expect(pickReminder({ orders: three, now: NOW, lastReminderAt: NOW - 59 * DAY })).toBeNull()
  })
  it("skips orders with nothing Order again can copy", () => {
    expect(pickReminder({ orders: [order("a", 300, [item("x", 5, false)]), order("b", 200, [item("x", 5, false)]), order("c", 100, [item("x", 5, false)])], now: NOW })).toBeNull()
  })
  it("reminds about the order they repeat most", () => {
    const orders = [order("a", 300, [item("hoodie")]), order("b", 200, [item("tee")]), order("c", 100, [item("tee")])]
    expect(mostRepeatedOrder(orders)?.id).toBe("c")
    expect(pickReminder({ orders: [order("a", 300), order("b", 220, [item("hoodie")]), order("c", 100)], now: NOW })?.order.id).toBe("c")
  })
  it("seasonal: one order about a year ago", () => {
    const p = pickReminder({ orders: [order("a", 365)], now: NOW })
    expect(p?.trigger).toBe("season")
    expect(pickReminder({ orders: [order("a", 200)], now: NOW })).toBeNull()
  })
})
