import {
  deriveTierMinorFromSpreadsheet100PlusAnchor,
  roundMinorUpToNearestTenCents,
} from "../spreadsheet-money"

describe("spreadsheet-money tiers", () => {
  it("roundMinorUpToNearestTenCents rounds up to next 10¢", () => {
    expect(roundMinorUpToNearestTenCents(2995)).toBe(3000)
    expect(roundMinorUpToNearestTenCents(2990)).toBe(2990)
    expect(roundMinorUpToNearestTenCents(1)).toBe(10)
  })

  it("deriveTierMinorFromSpreadsheet100PlusAnchor uses 100+ anchor and %-off-list ladder", () => {
    const tiers = deriveTierMinorFromSpreadsheet100PlusAnchor(800)
    expect(tiers.t100_plus).toBe(800)
    expect(tiers.t50_99).toBe(roundMinorUpToNearestTenCents((800 / 0.8) * 0.85))
    expect(tiers.t1_9).toBe(roundMinorUpToNearestTenCents((800 / 0.8) * 1.0))
  })
})
