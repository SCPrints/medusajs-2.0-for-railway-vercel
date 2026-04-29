import { tiersFromCostMinor } from "../as-colour-tier-math"

describe("tiersFromCostMinor", () => {
  it("throws for non-positive cost", () => {
    expect(() => tiersFromCostMinor(0)).toThrow()
    expect(() => tiersFromCostMinor(-1)).toThrow()
  })

  /**
   * Parcel Tote style 1000: cost $6.95 → tier100 = round(695 × 1.1 × 1.5) = 1147 minor ($11.47).
   * L = 1147 / 0.8 = 1433.75
   */
  it("matches Parcel Tote 6.95 AUD example", () => {
    const tiers = tiersFromCostMinor(695)
    expect(tiers).toEqual([
      { min_quantity: 1, max_quantity: 9, amount: 1434 },
      { min_quantity: 10, max_quantity: 19, amount: 1362 },
      { min_quantity: 20, max_quantity: 49, amount: 1290 },
      { min_quantity: 50, max_quantity: 99, amount: 1219 },
      { min_quantity: 100, amount: 1147 },
    ])
  })
})
