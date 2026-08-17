import {
  calculateScreenPrice,
  SCREEN_PER_SCREEN_FEE,
  SCREEN_REPEAT_SCREEN_FEE,
  SCREEN_OVER_MAX_QUANTITY,
} from "./screen"

describe("calculateScreenPrice", () => {
  it("prices a 2-colour 50-piece job with screen setup", () => {
    const r = calculateScreenPrice({ colours: 2, quantity: 50 })
    expect(r.unitPrice).toBe(5.7)
    expect(r.decorationSubtotal).toBe(285)
    expect(r.setupTotal).toBe(SCREEN_PER_SCREEN_FEE * 2)
    // HOLD cutover: rate-card sum ($285 + $198 setup = $483) is the inc-GST
    // total; GST is extracted (÷11), not added on top.
    expect(r.totalIncGst).toBe(483)
    expect(r.gst).toBe(43.91)
    expect(r.subtotalExGst).toBe(439.09)
  })

  it("bumps colour count when dark garment is selected", () => {
    const light = calculateScreenPrice({ colours: 4, quantity: 100 })
    const dark = calculateScreenPrice({ colours: 4, quantity: 100, darkGarment: true })
    // 100 falls in 100–199 tier; 4 col $5.50, 5 col $5.95
    expect(light.unitPrice).toBe(5.5)
    expect(dark.unitPrice).toBe(5.95)
    expect(dark.setupTotal).toBeGreaterThan(light.setupTotal)
  })

  it("adds the heavy-garment surcharge per print", () => {
    const tee = calculateScreenPrice({ colours: 1, quantity: 100 })
    const hoodie = calculateScreenPrice({ colours: 1, quantity: 100, heavyGarment: true })
    expect(tee.unitPrice).toBe(4.0)
    expect(hoodie.unitPrice).toBe(5.0)
  })

  it("uses the repeat screen fee on reorders", () => {
    const r = calculateScreenPrice({ colours: 3, quantity: 100, reorder: true })
    expect(r.setupTotal).toBe(SCREEN_REPEAT_SCREEN_FEE * 3)
  })

  it("flags below minimum and above max", () => {
    const tooFew = calculateScreenPrice({ colours: 1, quantity: 20 })
    const tooMany = calculateScreenPrice({ colours: 1, quantity: 1500 })
    expect(tooFew.belowMinimum).toBe(true)
    expect(tooMany.belowMinimum).toBe(true)
    expect(tooMany.notes?.some((n) => n.includes("manual quote"))).toBe(true)
    expect(SCREEN_OVER_MAX_QUANTITY).toBe(999)
  })

  it("prices priority rush at 30% of print + setup, no express", () => {
    const priority = calculateScreenPrice({ colours: 1, quantity: 100, rushTier: "priority" })
    // decoration $400 + setup $99 = $499 → rush $149.70
    expect(priority.rushSurcharge).toBe(149.7)
    const express = calculateScreenPrice({ colours: 1, quantity: 100, rushTier: "express" })
    expect(express.rushSurcharge).toBe(0)
  })
})
