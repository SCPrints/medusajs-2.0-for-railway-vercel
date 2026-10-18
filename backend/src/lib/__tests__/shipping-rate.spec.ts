import {
  FREIGHT_IN_PER_ORDER_AUD,
  POSTAGE_WEIGHT_BANDS,
  SHIPPING_WEIGHT_BANDS,
  computeShippingAmount,
} from "../shipping-rate"

describe("computeShippingAmount (weight → price ladder)", () => {
  // Every band = postage + the $15 once-per-order freight-in.
  it("charges the freight-in once per order on top of postage", () => {
    expect(FREIGHT_IN_PER_ORDER_AUD).toBe(15)
    expect(POSTAGE_WEIGHT_BANDS[0].amount).toBe(11)
    expect(SHIPPING_WEIGHT_BANDS[0].amount).toBe(26)
  })

  it("returns the first band for empty/zero/negative/NaN weight", () => {
    expect(computeShippingAmount(0)).toBe(26)
    expect(computeShippingAmount(-50)).toBe(26)
    expect(computeShippingAmount(Number.NaN)).toBe(26)
  })

  it("prices each band by its inclusive upper bound", () => {
    expect(computeShippingAmount(500)).toBe(26)
    expect(computeShippingAmount(1000)).toBe(26) // boundary, inclusive
    expect(computeShippingAmount(1001)).toBe(30) // just over → next band
    expect(computeShippingAmount(3000)).toBe(30)
    expect(computeShippingAmount(3001)).toBe(35)
    expect(computeShippingAmount(5000)).toBe(35)
    expect(computeShippingAmount(5001)).toBe(47)
    expect(computeShippingAmount(10000)).toBe(47)
    expect(computeShippingAmount(10001)).toBe(70)
    expect(computeShippingAmount(22000)).toBe(70)
  })

  it("adds a per-kg overage above the top band (rounding part-kg up)", () => {
    // top band = 22kg @ $55 + $15 freight-in = $70, overage = $3/kg
    expect(computeShippingAmount(22001)).toBe(73) // +1g → 1kg billed
    expect(computeShippingAmount(23000)).toBe(73) // +1kg exactly
    expect(computeShippingAmount(23001)).toBe(76) // +1.001kg → 2kg billed
    expect(computeShippingAmount(25000)).toBe(79) // +3kg
  })

  it("keeps scaling for freight-sized orders (no flat ceiling)", () => {
    // 100kg cart: 70 + (100-22)kg * 3 = 70 + 234 = 304
    expect(computeShippingAmount(100000)).toBe(304)
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
