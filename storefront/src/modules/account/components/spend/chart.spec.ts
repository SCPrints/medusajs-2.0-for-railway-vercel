import { chartBars, niceMax } from "./chart"

const month = (m: string, total: number) => ({ month: m, label: m, total, orders: total ? 1 : 0 })

describe("spend chart maths", () => {
  it("rounds the top of the chart up to a tidy number", () => {
    expect(niceMax(0)).toBe(100)
    expect(niceMax(87)).toBe(100)
    expect(niceMax(2844)).toBe(5000)
    expect(niceMax(2400)).toBe(2500)
    expect(niceMax(1000)).toBe(1000)
  })
  it("scales bars to the max, keeps small months visible and labels the years", () => {
    const { max, bars } = chartBars([month("2025-12", 0), month("2026-01", 1250), month("2026-02", 10), month("2026-03", 2500)])
    expect(max).toBe(2500)
    expect(bars.map((b) => b.pct)).toEqual([0, 50, 2, 100])
    expect(bars.map((b) => b.tick)).toEqual(["2025", "2026", "", ""])
  })
})
