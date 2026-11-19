import type { SpendMonth } from "@lib/data/spend"

/** Pure maths for the spend bar chart — unit-tested. */

/** A round number at or above `value` for the top of the chart (1, 2, 2.5 or 5 × a power of ten). */
export function niceMax(value: number): number {
  if (!(value > 0)) return 100
  const pow = Math.pow(10, Math.floor(Math.log10(value)))
  const steps = [1, 2, 2.5, 5, 10]
  for (let i = 0; i < steps.length; i++) if (steps[i] * pow >= value) return steps[i] * pow
  return 10 * pow
}

export type ChartBar = SpendMonth & {
  /** Bar height, 0-100 (% of the chart). A month with spend is never drawn shorter than 2%. */
  pct: number
  /** Label under the bar: the year under each January and under the first bar, else "". */
  tick: string
}

export function chartBars(months: SpendMonth[]): { max: number; bars: ChartBar[] } {
  const max = niceMax(months.reduce((m, x) => Math.max(m, x.total), 0))
  return {
    max,
    bars: months.map((m, i) => ({
      ...m,
      pct: m.total > 0 ? Math.max(2, Math.round((m.total / max) * 1000) / 10) : 0,
      tick: i === 0 || m.month.endsWith("-01") ? m.month.slice(0, 4) : "",
    })),
  }
}
