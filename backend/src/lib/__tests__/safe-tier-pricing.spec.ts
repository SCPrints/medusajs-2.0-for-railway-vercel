import {
  costExGstMinorFromMetadata,
  findBelowCostViolations,
  isBelowCost,
} from "../safe-tier-pricing"

describe("isBelowCost", () => {
  it("flags a 100+ tier below cash cost (the DNC inversion shape)", () => {
    // DNC 4202: cost $14.00 ex-GST → cash cost $15.40. Inverted sheet put
    // $14.00 in as the 100+ retail tier.
    expect(isBelowCost(1400, 1400)).toBe(true)
  })

  it("passes a 100+ tier at or above cash cost", () => {
    expect(isBelowCost(1540, 1400)).toBe(false) // exactly cash cost
    expect(isBelowCost(2310, 1400)).toBe(false) // proper ladder (cost × 1.65)
  })

  it("cannot check variants without a usable cost", () => {
    expect(isBelowCost(100, null)).toBe(false)
    expect(isBelowCost(100, undefined)).toBe(false)
    expect(isBelowCost(100, 0)).toBe(false)
    expect(isBelowCost(100, -50)).toBe(false)
    expect(isBelowCost(100, NaN)).toBe(false)
  })
})

describe("costExGstMinorFromMetadata", () => {
  it("reads a numeric cost", () => {
    expect(costExGstMinorFromMetadata({ cost_price_ex_gst_minor: 1400 })).toBe(1400)
  })
  it("tolerates a stringified cost", () => {
    expect(costExGstMinorFromMetadata({ cost_price_ex_gst_minor: "1400" })).toBe(1400)
  })
  it("returns null for absent/junk values", () => {
    expect(costExGstMinorFromMetadata(null)).toBeNull()
    expect(costExGstMinorFromMetadata({})).toBeNull()
    expect(costExGstMinorFromMetadata({ cost_price_ex_gst_minor: "abc" })).toBeNull()
    expect(costExGstMinorFromMetadata({ cost_price_ex_gst_minor: 0 })).toBeNull()
  })
})

describe("findBelowCostViolations", () => {
  it("collects violations with the cash-cost math filled in", () => {
    const violations = findBelowCostViolations([
      { variant_id: "v1", sku: "420234912", t100_plus_minor: 1400, cost_ex_gst_minor: 1400 },
      { variant_id: "v2", sku: "OK-1", t100_plus_minor: 2310, cost_ex_gst_minor: 1400 },
      { variant_id: "v3", sku: "NOCOST", t100_plus_minor: 100, cost_ex_gst_minor: null },
    ])
    expect(violations).toEqual([
      {
        variant_id: "v1",
        sku: "420234912",
        cost_ex_gst_minor: 1400,
        cash_cost_minor: 1540,
        t100_plus_minor: 1400,
      },
    ])
  })

  it("returns empty for a clean batch", () => {
    expect(
      findBelowCostViolations([
        { variant_id: "v1", sku: null, t100_plus_minor: 2310, cost_ex_gst_minor: 1400 },
      ])
    ).toEqual([])
  })
})
