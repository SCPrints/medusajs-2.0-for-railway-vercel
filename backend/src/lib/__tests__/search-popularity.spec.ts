import { searchPopularity, unitsSoldByProduct } from "../search-popularity"

describe("searchPopularity", () => {
  it("ranks a staple above any best-seller, then by sales", () => {
    expect(searchPopularity({ search_boost: true })).toBeGreaterThan(searchPopularity({ sales_90d: 5000 }))
    expect(searchPopularity({ search_boost: 2 })).toBeGreaterThan(searchPopularity({ search_boost: true, sales_90d: 900 }))
    expect(searchPopularity({ sales_90d: 12 })).toBe(12)
    expect(searchPopularity({})).toBe(0)
    expect(searchPopularity({ search_boost: "nope", sales_90d: -3 })).toBe(0)
  })
})

describe("unitsSoldByProduct", () => {
  it("sums quantities in the window, skips cancelled and old orders", () => {
    const since = new Date("2026-08-01").getTime()
    const map = unitsSoldByProduct(
      [
        { status: "completed", created_at: "2026-09-01", items: [{ product_id: "a", quantity: 10 }, { product_id: "b", quantity: { numeric: 3 } }] },
        { status: "pending", created_at: "2026-10-01", items: [{ product_id: "a", quantity: 5 }] },
        { status: "canceled", created_at: "2026-10-01", items: [{ product_id: "a", quantity: 100 }] },
        { status: "completed", created_at: "2026-01-01", items: [{ product_id: "b", quantity: 100 }] },
      ],
      since
    )
    expect(map.get("a")).toBe(15)
    expect(map.get("b")).toBe(3)
  })
})
