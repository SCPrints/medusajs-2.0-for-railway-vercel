import { calculateDtfPrice, DTF_ARTWORK_SETUP_FEE, DTF_UNDER_MIN_FEE } from "./dtf"

describe("calculateDtfPrice", () => {
  it("uses the existing SCP unit matrix and tier index", () => {
    const r = calculateDtfPrice({ sizeId: "up_to_a4", quantity: 25 })
    // qty 25 → tier 20–49 (index 2) → A4 = $8.50
    expect(r.unitPrice).toBe(8.5)
  })

  it("applies under-minimum fee below 10 units", () => {
    const r = calculateDtfPrice({ sizeId: "up_to_a6", quantity: 5 })
    expect(r.belowMinimum).toBe(true)
    expect(r.setupTotal).toBe(DTF_ARTWORK_SETUP_FEE + DTF_UNDER_MIN_FEE)
  })

  it("waives artwork setup on reorders", () => {
    const r = calculateDtfPrice({ sizeId: "up_to_a6", quantity: 50, reorder: true })
    expect(r.setupTotal).toBe(0)
  })
})
