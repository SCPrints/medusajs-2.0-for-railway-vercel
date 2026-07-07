import { pctTrend } from "../trend"

describe("pctTrend", () => {
  it("returns null without a comparable prior", () => {
    expect(pctTrend(10, null)).toBeNull()
    expect(pctTrend(10, undefined)).toBeNull()
    expect(pctTrend(10, 0)).toBeNull()
  })

  it("up is good for normal metrics (clicks/impressions/ctr)", () => {
    expect(pctTrend(120, 100)).toEqual({ dir: "up", good: true, text: "20.0%" })
  })

  it("down is bad for normal metrics", () => {
    const t = pctTrend(80, 100)
    expect(t?.dir).toBe("down")
    expect(t?.good).toBe(false)
  })

  it("lower-is-better: a decrease is good (avg position improving)", () => {
    const t = pctTrend(34.2, 36.3, false)
    expect(t?.dir).toBe("down")
    expect(t?.good).toBe(true)
  })

  it("lower-is-better: an increase is bad", () => {
    expect(pctTrend(40, 36, false)?.good).toBe(false)
  })

  it("flat within tolerance", () => {
    expect(pctTrend(100, 100)).toEqual({ dir: "flat", good: true, text: "0.0%" })
  })
})
