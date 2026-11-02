export type Trend = { dir: "up" | "down" | "flat"; text: string }

/**
 * Signed % change of `curr` vs `prior`, as a trend descriptor for a KPI tile or
 * table cell. The UI colours by raw direction (up = green) EXCEPT for rank-style
 * metrics (position), where callers pass `lowerIsBetter` so a falling number
 * reads as an improvement. Returns null when there's no comparable
 * prior (missing or zero) so the caller shows no trend rather than a bogus ∞%.
 */
export function pctTrend(curr: number, prior: number | null | undefined): Trend | null {
  if (prior == null || prior === 0) return null
  const change = ((curr - prior) / prior) * 100
  if (!Number.isFinite(change)) return null
  if (Math.abs(change) < 0.05) return { dir: "flat", text: "0.0%" }
  return { dir: change > 0 ? "up" : "down", text: `${Math.abs(change).toFixed(1)}%` }
}
