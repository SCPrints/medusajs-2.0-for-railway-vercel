import {
  dtfFloorExMajor,
  embroideryCostExMajor,
  fullColourFloorExMajor,
  priceQuoteJob,
  supacolourBlockerCostExMajor,
  uvdtfFloorExPerLm,
} from "../quote-pricing"

// Expected values are the workbook's (SC-Prints-Cost-Model.xlsx) — if a dial
// changes there, change the constant here and these numbers together.
describe("quote-pricing cost basis", () => {
  it("DTF roll floor per print = row length × $38/lm ÷ across × wastage + 2 min press", () => {
    expect(dtfFloorExMajor("up_to_a6")).toBe(4.28)
    expect(dtfFloorExMajor("up_to_a4")).toBe(7.57)
    expect(dtfFloorExMajor("up_to_a3")).toBe(12.46)
    expect(dtfFloorExMajor("oversize")).toBe(13.77)
  })

  it("channel floor takes Supacolour wearable only where it beats the roll (A3 at 100+)", () => {
    expect(fullColourFloorExMajor("up_to_a3", 2)).toBe(12.46)
    expect(fullColourFloorExMajor("up_to_a3", 4)).toBe(9.88)
    expect(fullColourFloorExMajor("up_to_a6", 4)).toBe(4.28)
    expect(fullColourFloorExMajor("oversize", 4)).toBe(13.77)
  })

  it("Supacolour blocker applied cost = direct transfer + press; qty 1-19 at the 20-49 band", () => {
    expect(supacolourBlockerCostExMajor("up_to_a6", 0)).toBe(7.22)
    expect(supacolourBlockerCostExMajor("up_to_a3", 4)).toBe(10.93)
    expect(supacolourBlockerCostExMajor("oversize", 0)).toBeNull()
  })

  it("embroidery: in-house to 100 units (hoop time floor), GAA above", () => {
    expect(embroideryCostExMajor(3000, 10)).toBe(5)
    expect(embroideryCostExMajor(12000, 10)).toBe(10.81)
    expect(embroideryCostExMajor(5000, 200)).toBe(2.7)
    expect(embroideryCostExMajor(1500, 10)).toBe(5) // under 3k costs as 3k
  })

  it("UV DTF floor per lineal metre at the 40 lm/month dial", () => {
    expect(uvdtfFloorExPerLm()).toBe(31.39)
  })
})

describe("priceQuoteJob", () => {
  it("prices a DTF print on our garment with the live card and the roll floor", () => {
    const r = priceQuoteJob(
      { quantity: 50, prints: [{ sizeId: "up_to_a4" }] },
      { title: "Tee", unitSellMajor: 20, unitCostExMajor: 8, supacolour: false, screenHeavy: false }
    )
    const print = r.components.find((c) => c.key === "print-0")!
    expect(print.unitSellMajor).toBe(9.5)
    expect(print.unitCostExMajor).toBe(7.57)
    expect(print.marginExMajor).toBe(53.32)
    expect(r.perGarmentSellMajor).toBe(29.5)
    expect(r.totals.sellIncMajor).toBe(1475)
    // garment margin: 20/1.1 − 8 = 10.18/unit
    expect(r.components[0].marginExMajor).toBe(509.09)
  })

  it("switches to the Supacolour card + per-design setup on a flagged garment", () => {
    const r = priceQuoteJob(
      { quantity: 10, prints: [{ sizeId: "up_to_a6" }] },
      { title: "Poly polo", unitSellMajor: 30, unitCostExMajor: 12, supacolour: true, screenHeavy: false }
    )
    expect(r.components.find((c) => c.key === "print-0")).toMatchObject({ unitSellMajor: 11, unitCostExMajor: 7.22 })
    expect(r.components.find((c) => c.key === "supacolour-setup")).toMatchObject({
      quantity: 1, unitSellMajor: 69, unitCostExMajor: 40, setupProduct: "supacolour_setup",
    })
  })

  it("screen: underbase + heavy garment on the DSP cost, one setup per screen", () => {
    const r = priceQuoteJob(
      { quantity: 50, screen: { positions: [{ colours: 1, darkGarment: true }], heavyGarment: true } },
      null
    )
    expect(r.components.find((c) => c.key === "screen-0")).toMatchObject({ unitSellMajor: 7.5, unitCostExMajor: 4.3 })
    expect(r.components.find((c) => c.key === "screen-setup")).toMatchObject({ quantity: 2, unitSellMajor: 99, unitCostExMajor: 70 })
    expect(r.warnings).toEqual([])
  })

  it("flags screen below minimum, embroidery over the cap, oversize Supacolour", () => {
    const r = priceQuoteJob(
      {
        quantity: 10,
        printChannel: "supacolour",
        prints: [{ sizeId: "oversize" }],
        screen: { positions: [{ colours: 2 }] },
        embroidery: [{ stitchCount: 15000 }],
      },
      null
    )
    expect(r.warnings).toHaveLength(3)
    expect(r.components.filter((c) => c.requiresQuote)).toHaveLength(2)
    expect(r.components.find((c) => c.key === "supacolour-setup")).toBeUndefined()
    expect(r.components.find((c) => c.key === "digitizing")).toBeUndefined()
  })

  it("BYO adds the per-position handling fee; trade cards are ex GST + GST", () => {
    const byo = priceQuoteJob({ quantity: 20, printChannel: "byo", prints: [{ sizeId: "up_to_a3" }] }, null)
    expect(byo.components[0].unitSellMajor).toBe(17.5)
    const promo = priceQuoteJob({ quantity: 20, printChannel: "promo", prints: [{ sizeId: "up_to_a3" }] }, null)
    expect(promo.components[0].unitSellMajor).toBe(14.3)
    const press = priceQuoteJob({ quantity: 20, printChannel: "press_only", prints: [{ sizeId: "up_to_a3" }] }, null)
    expect(press.components[0]).toMatchObject({ unitSellMajor: 4.13, unitCostExMajor: 3.17 })
  })

  it("embroidery: card per placement, one digitizing fee per file, trade card option", () => {
    const r = priceQuoteJob(
      { quantity: 30, embroidery: [{ stitchCount: 6000 }, { stitchCount: 6000, digitizing: false }] },
      null
    )
    expect(r.components.filter((c) => c.key.startsWith("emb-"))).toHaveLength(2)
    // 6k st: run 10 min ÷ 3 heads = 3.33 operator min → $5.28 + $0.25 thread
    expect(r.components[0]).toMatchObject({ unitSellMajor: 10.25, unitCostExMajor: 5.53 })
    expect(r.components.find((c) => c.key === "digitizing")).toMatchObject({ quantity: 1, unitSellMajor: 60 })
    const trade = priceQuoteJob({ quantity: 30, embroidery: [{ stitchCount: 6000 }], embroideryPromo: true }, null)
    expect(trade.components[0].unitSellMajor).toBe(8.25)
  })

  it("UV DTF prices by metre band, setup waived on reorder", () => {
    const r = priceQuoteJob({ quantity: 1, uvdtf: { metres: 5 } }, null)
    expect(r.components.find((c) => c.key === "uvdtf")).toMatchObject({ kind: "per_metre", quantity: 5, unitSellMajor: 52, unitCostExMajor: 31.39 })
    expect(r.components.find((c) => c.key === "uvdtf-setup")).toMatchObject({ unitSellMajor: 25, unitCostExMajor: 15.83 })
    expect(priceQuoteJob({ quantity: 1, uvdtf: { metres: 1, reorder: true } }, null).components).toHaveLength(1)
  })
})
