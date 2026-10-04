import { calculateDtfPrice } from "./dtf"

describe("calculateDtfPrice", () => {
  it("uses the existing SCP unit matrix and tier index", () => {
    const r = calculateDtfPrice({ sizeId: "up_to_a4", quantity: 25 })
    // qty 25 → tier 20–49 (index 2) → A4 = $9.50
    expect(r.unitPrice).toBe(9.5)
  })

  it("has no minimum and no setup fee — from 1 piece", () => {
    const r = calculateDtfPrice({ sizeId: "up_to_a6", quantity: 1 })
    expect(r.belowMinimum).toBe(false)
    expect(r.setupTotal).toBe(0)
    expect(r.totalIncGst).toBe(r.unitPrice)
  })
})
