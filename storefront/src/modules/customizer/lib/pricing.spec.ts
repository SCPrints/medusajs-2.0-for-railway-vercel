import { calculatePricing } from "./pricing"

describe("calculatePricing", () => {
  it("applies side surcharges and quantity discounts", () => {
    const pricing = calculatePricing({
      basePriceCents: 2000,
      decoratedSidesCount: 3,
      totalQuantity: 50,
    })

    expect(pricing.sideSurchargePerUnitCents).toBe(500)
    expect(pricing.quantityDiscountRate).toBe(0.15)
    expect(pricing.discountedUnitPriceCents).toBe(2125)
    expect(pricing.totalPriceCents).toBe(106250)
  })

  it("keeps quantity at minimum one for calculations", () => {
    const pricing = calculatePricing({
      basePriceCents: 1500,
      decoratedSidesCount: 1,
      totalQuantity: 0,
    })

    expect(pricing.totalPriceCents).toBe(1500)
  })

  it("uses bulk tiers as base unit pricing when provided", () => {
    const pricing = calculatePricing({
      basePriceCents: 3000,
      decoratedSidesCount: 2,
      totalQuantity: 55,
      bulkPricingTiers: [
        { minQuantity: 1, maxQuantity: 9, amountCents: 2390 },
        { minQuantity: 10, maxQuantity: 49, amountCents: 2151 },
        { minQuantity: 50, maxQuantity: 99, amountCents: 1912 },
        { minQuantity: 100, amountCents: 1792 },
      ],
    })

    expect(pricing.hasBulkPricing).toBe(true)
    expect(pricing.baseUnitPriceCents).toBe(1912)
    expect(pricing.sideSurchargePerUnitCents).toBe(500)
    expect(pricing.discountedUnitPriceCents).toBe(2412)
    expect(pricing.totalPriceCents).toBe(132660)
  })
})
