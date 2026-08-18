import {
  SCREEN_MAX_COLOURS,
  SCREEN_MIN_QUANTITY,
  SCP_SCREEN_QUANTITY_TIERS,
  resolveScreenTierIndexForQuantity,
  screenUnitMajor,
} from "../scp-screen-print-pricing"

describe("scp-screen-print-pricing", () => {
  it("maps quantity to supplier-aligned tier indices", () => {
    expect(resolveScreenTierIndexForQuantity(25)).toBe(0)
    expect(resolveScreenTierIndexForQuantity(49)).toBe(0)
    expect(resolveScreenTierIndexForQuantity(50)).toBe(1)
    expect(resolveScreenTierIndexForQuantity(100)).toBe(2)
    expect(resolveScreenTierIndexForQuantity(200)).toBe(3)
    expect(resolveScreenTierIndexForQuantity(500)).toBe(4)
    expect(resolveScreenTierIndexForQuantity(999)).toBe(4)
  })

  it("clamps below-minimum to tier 0 and above-max to the top tier", () => {
    expect(resolveScreenTierIndexForQuantity(1)).toBe(0)
    expect(resolveScreenTierIndexForQuantity(SCREEN_MIN_QUANTITY - 1)).toBe(0)
    expect(resolveScreenTierIndexForQuantity(5000)).toBe(
      SCP_SCREEN_QUANTITY_TIERS.length - 1
    )
  })

  it("prices by colour count and quantity band", () => {
    // 1-colour at 100-199 = $4.00; 6-colour at 25-49 = $18.35
    expect(screenUnitMajor({ quantity: 100, colours: 1 }).unitMajor).toBe(4.0)
    expect(screenUnitMajor({ quantity: 25, colours: 6 }).unitMajor).toBe(18.35)
  })

  it("adds the underbase colour on dark garments, capped at 6", () => {
    const dark = screenUnitMajor({ quantity: 100, colours: 4, darkGarment: true })
    expect(dark.effectiveColours).toBe(5)
    expect(dark.unitMajor).toBe(5.95)
    const maxed = screenUnitMajor({
      quantity: 100,
      colours: SCREEN_MAX_COLOURS,
      darkGarment: true,
    })
    expect(maxed.effectiveColours).toBe(SCREEN_MAX_COLOURS)
  })

  it("adds the heavy-garment surcharge per print", () => {
    const tee = screenUnitMajor({ quantity: 200, colours: 2 })
    const hoodie = screenUnitMajor({ quantity: 200, colours: 2, heavyGarment: true })
    expect(tee.unitMajor).toBe(3.65)
    expect(hoodie.unitMajor).toBe(4.65)
  })
})
