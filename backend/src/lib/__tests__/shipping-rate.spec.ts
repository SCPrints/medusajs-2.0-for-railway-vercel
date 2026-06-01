import {
  SHIPPING_WEIGHT_BANDS,
  computeShippingAmount,
} from "../shipping-rate"

describe("computeShippingAmount (weight → price ladder)", () => {
  it("returns the first band for empty/zero/negative/NaN weight", () => {
    expect(computeShippingAmount(0)).toBe(11)
    expect(computeShippingAmount(-50)).toBe(11)
    expect(computeShippingAmount(Number.NaN)).toBe(11)
  })

  it("prices each band by its inclusive upper bound", () => {
    expect(computeShippingAmount(500)).toBe(11)
    expect(computeShippingAmount(1000)).toBe(11) // boundary, inclusive
    expect(computeShippingAmount(1001)).toBe(15) // just over → next band
    expect(computeShippingAmount(3000)).toBe(15)
    expect(computeShippingAmount(3001)).toBe(20)
    expect(computeShippingAmount(5000)).toBe(20)
    expect(computeShippingAmount(5001)).toBe(32)
    expect(computeShippingAmount(10000)).toBe(32)
    expect(computeShippingAmount(10001)).toBe(55)
    expect(computeShippingAmount(22000)).toBe(55)
  })

  it("adds a per-kg overage above the top band (rounding part-kg up)", () => {
    // top band = 22kg @ $55, overage = $3/kg
    expect(computeShippingAmount(22001)).toBe(58) // +1g → 1kg billed
    expect(computeShippingAmount(23000)).toBe(58) // +1kg exactly
    expect(computeShippingAmount(23001)).toBe(61) // +1.001kg → 2kg billed
    expect(computeShippingAmount(25000)).toBe(64) // +3kg
  })

  it("keeps scaling for freight-sized orders (no flat ceiling)", () => {
    // 100kg cart: 55 + (100-22)kg * 3 = 55 + 234 = 289
    expect(computeShippingAmount(100000)).toBe(289)
    // monotonic non-decreasing across a sweep
    let prev = 0
    for (let g = 0; g <= 60000; g += 250) {
      const amt = computeShippingAmount(g)
      expect(amt).toBeGreaterThanOrEqual(prev)
      prev = amt
    }
  })

  it("has a sane, ascending band table", () => {
    for (let i = 1; i < SHIPPING_WEIGHT_BANDS.length; i++) {
      expect(SHIPPING_WEIGHT_BANDS[i].maxGrams).toBeGreaterThan(
        SHIPPING_WEIGHT_BANDS[i - 1].maxGrams
      )
      expect(SHIPPING_WEIGHT_BANDS[i].amount).toBeGreaterThanOrEqual(
        SHIPPING_WEIGHT_BANDS[i - 1].amount
      )
    }
  })
})
