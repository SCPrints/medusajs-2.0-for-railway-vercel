export type Trend = { dir: "up" | "down" | "flat"; text: string }

/**
 * Signed % change of `curr` vs `prior`, as a trend descriptor for a KPI tile or
 * table cell. Colour follows direction in the UI (up = green, down = red),
 * regardless of whether the metric is "better" higher or lower — a raw
 * up/down reference, not a judgement. Returns null when there's no comparable
 * prior (missing or zero) so the caller shows no trend rather than a bogus ∞%.
 */
export function pctTrend(curr: number, prior: number | null | undefined): Trend | null {
  if (prior == null || prior === 0) return null
  const change = ((curr - prior) / prior) * 100
  if (!Number.isFinite(change)) return null
  if (Math.abs(change) < 0.05) return { dir: "flat", text: "0.0%" }
  return { dir: change > 0 ? "up" : "down", text: `${Math.abs(change).toFixed(1)}%` }
}
