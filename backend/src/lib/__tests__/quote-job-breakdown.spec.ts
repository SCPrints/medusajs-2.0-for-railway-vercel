import { buildQuoteJobBreakdown } from "../quote-job-breakdown"

const quote = (over: Record<string, unknown> = {}) => ({
  line_items: {
    items: [
      { id: "jp_r_row1:M", quantity: 10, unit_price: 25 },
      { id: "jp_x_screen-setup-A", quantity: 2, unit_price: 55 },
      { id: "manual_1", quantity: 1, unit_price: 999 },
    ],
  },
  metadata: {
    job_pricer: {
      snapshot: {
        summary: "10 × Tee (screen)",
        tier: "Platinum",
        garmentQuantity: 10,
        designs: [{ label: "A", repeat: false, imageUrl: "https://r2/a.png" }],
        groups: [
          {
            title: "Tee",
            thumbnail: null,
            quantity: 10,
            unitSellMin: 25,
            unitSellMax: 25,
            sellTotalMajor: 250,
            marginPct: 40,
            override: true,
            positions: ["Front: Screen print 1 col (design A)"],
            rows: [{ label: "Black / M", quantity: 10, unitSellMajor: 25, sellTotalMajor: 250 }],
          },
        ],
        extras: [{ label: "Screen setup — design A (2 screens)", quantity: 2, unitSellMajor: 55, sellTotalMajor: 110, waived: false }],
        totals: { subtotalIncMajor: 360, discountMajor: 0, sellIncMajor: 360, costExMajor: 100, marginExMajor: 200, marginPct: 61 },
      },
    },
  },
  ...over,
})

describe("buildQuoteJobBreakdown", () => {
  it("strips cost / margin / tier and keeps the customer-facing structure", () => {
    const b = buildQuoteJobBreakdown(quote())!
    expect(b.totals).toEqual({ subtotal: 360, discount: 0, total: 360 })
    expect(b.groups[0]).toMatchObject({ title: "Tee", quantity: 10, unit_min: 25, total: 250 })
    expect(JSON.stringify(b)).not.toMatch(/margin|cost|Platinum|override/)
    expect(b.designs[0].image_url).toBe("https://r2/a.png")
  })

  it("returns null when a pricer line was edited by hand after pricing", () => {
    const q = quote()
    q.line_items.items[0].unit_price = 30
    expect(buildQuoteJobBreakdown(q)).toBeNull()
  })

  it("returns null without a snapshot or without pricer lines", () => {
    expect(buildQuoteJobBreakdown({ metadata: {} })).toBeNull()
    expect(buildQuoteJobBreakdown(quote({ line_items: { items: [{ id: "manual", quantity: 1, unit_price: 360 }] } }))).toBeNull()
  })
})
