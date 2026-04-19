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
})
