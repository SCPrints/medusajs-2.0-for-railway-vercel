import { pctTrend } from "../trend"

describe("pctTrend", () => {
  it("returns null without a comparable prior", () => {
    expect(pctTrend(10, null)).toBeNull()
    expect(pctTrend(10, undefined)).toBeNull()
    expect(pctTrend(10, 0)).toBeNull()
  })

  it("up when current exceeds prior", () => {
    expect(pctTrend(120, 100)).toEqual({ dir: "up", text: "20.0%" })
  })

  it("down when current is below prior (colour follows direction, not judgement)", () => {
    expect(pctTrend(80, 100)).toEqual({ dir: "down", text: "20.0%" })
    // avg position falling is 'good' but still renders as a down/red trend
    expect(pctTrend(34.2, 36.3)?.dir).toBe("down")
  })

  it("flat within tolerance", () => {
    expect(pctTrend(100, 100)).toEqual({ dir: "flat", text: "0.0%" })
  })
})
