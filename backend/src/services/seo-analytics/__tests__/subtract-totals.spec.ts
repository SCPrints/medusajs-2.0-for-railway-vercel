import { subtractTotals } from "../gsc-client"

jest.mock("googleapis", () => ({ google: {} }))

describe("subtractTotals", () => {
  it("removes brand and re-derives weighted position + ctr", () => {
    const all = { clicks: 85, impressions: 100, ctr: 0.85, position: 10 }
    const brand = { clicks: 30, impressions: 20, ctr: 1.5, position: 2 }
    // (10*100 - 2*20) / 80 = 12
    expect(subtractTotals(all, brand)).toEqual({ clicks: 55, impressions: 80, ctr: 55 / 80, position: 12 })
  })
  it("is zero-safe", () => {
    const t = { clicks: 1, impressions: 5, ctr: 0.2, position: 3 }
    expect(subtractTotals(t, t)).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 })
  })
})
