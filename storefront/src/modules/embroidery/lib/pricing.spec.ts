import {
  calculatePrice,
  buildPriceTable,
  RETAIL_CONFIG,
  WHOLESALE_CONFIG,
} from "./pricing"

describe("calculatePrice", () => {
  it("picks the matching flat stitch tier and quantity column", () => {
    const result = calculatePrice({
      stitchCount: 7000,
      quantity: 50,
      includeDigitizing: false,
    })
    // 7000 → second flat tier (≤8000), qty 50 → 48-tier (index 3)
    expect(result.unitDecorationPrice).toBe(10.0)
    expect(result.appliedTier.label).toBe("48–71")
    expect(result.decorationSubtotal).toBe(500)
  })

  it("applies the per-1k incremental row above the highest flat tier", () => {
    const result = calculatePrice({
      stitchCount: 18500, // 16k flat + 3 blocks of 1k (rounded up from 2.5)
      quantity: 24,
      includeDigitizing: false,
    })
    // qty 24 → tier index 2: highest flat 16k = 16, increment = 2.0
    // overflow 2500 → ceil(2500/1000) = 3 blocks × 2.0 = 6 → 22 per unit
    expect(result.unitDecorationPrice).toBe(22)
  })

  it("flags below minimum quantity for wholesale", () => {
    const result = calculatePrice({
      config: WHOLESALE_CONFIG,
      stitchCount: 6000,
      quantity: 12,
      includeDigitizing: false,
    })
    expect(result.belowMinimum).toBe(true)
  })

  it("includes digitizing fee for retail by default and excludes for wholesale", () => {
    const retail = calculatePrice({ stitchCount: 5000, quantity: 24 })
    const wholesale = calculatePrice({
      config: WHOLESALE_CONFIG,
      stitchCount: 5000,
      quantity: 24,
    })
    expect(retail.digitizingFee).toBe(60)
    expect(wholesale.digitizingFee).toBe(0)
  })
})

describe("buildPriceTable", () => {
  it("marks the last row as incremental", () => {
    const table = buildPriceTable(RETAIL_CONFIG)
    const last = table.rows[table.rows.length - 1]
    expect(last.isIncrementalRow).toBe(true)
    expect(last.label).toMatch(/\+1,000/)
  })
})
