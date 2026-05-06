import {
  calculateScreenPrice,
  SCREEN_PER_SCREEN_FEE,
  SCREEN_OVER_MAX_QUANTITY,
} from "./screen"

describe("calculateScreenPrice", () => {
  it("prices a 2-colour 50-piece job with screen setup", () => {
    const r = calculateScreenPrice({ colours: 2, quantity: 50 })
    expect(r.unitPrice).toBe(5.5)
    expect(r.decorationSubtotal).toBe(275)
    expect(r.setupTotal).toBe(SCREEN_PER_SCREEN_FEE * 2)
    expect(r.subtotalExGst).toBe(375)
  })

  it("bumps colour count when dark garment is selected", () => {
    const light = calculateScreenPrice({ colours: 4, quantity: 100 })
    const dark = calculateScreenPrice({ colours: 4, quantity: 100, darkGarment: true })
    // 100 falls in 75–125 tier; 4 col $5.30, 5 col $5.85
    expect(light.unitPrice).toBe(5.3)
    expect(dark.unitPrice).toBe(5.85)
    expect(dark.setupTotal).toBeGreaterThan(light.setupTotal)
  })

  it("flags below minimum and above max", () => {
    const tooFew = calculateScreenPrice({ colours: 1, quantity: 30 })
    const tooMany = calculateScreenPrice({ colours: 1, quantity: 1000 })
    expect(tooFew.belowMinimum).toBe(true)
    expect(tooMany.belowMinimum).toBe(true)
    expect(tooMany.notes?.some((n) => n.includes("manual quote"))).toBe(true)
    expect(SCREEN_OVER_MAX_QUANTITY).toBe(500)
  })

  it("applies priority rush fee but not express", () => {
    const priority = calculateScreenPrice({ colours: 1, quantity: 100, rushTier: "priority" })
    const express = calculateScreenPrice({ colours: 1, quantity: 100, rushTier: "express" })
    expect(priority.rushSurcharge).toBe(40)
    expect(express.rushSurcharge).toBe(0)
  })
})
