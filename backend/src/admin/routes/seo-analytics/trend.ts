export type Trend = { dir: "up" | "down" | "flat"; good: boolean; text: string }

/**
 * Signed % change of `curr` vs `prior`, as a trend descriptor for a KPI tile.
 * `goodWhenUp = false` for "lower is better" metrics (e.g. avg search position),
 * so a decrease renders green. Returns null when there's no comparable prior
 * (missing or zero) so the caller shows no trend rather than a bogus ∞%.
 */
export function pctTrend(
  curr: number,
  prior: number | null | undefined,
  goodWhenUp = true
): Trend | null {
  if (prior == null || prior === 0) return null
  const change = ((curr - prior) / prior) * 100
  if (!Number.isFinite(change)) return null
  if (Math.abs(change) < 0.05) return { dir: "flat", good: true, text: "0.0%" }
  const up = change > 0
  return {
    dir: up ? "up" : "down",
    good: up === goodWhenUp,
    text: `${Math.abs(change).toFixed(1)}%`,
  }
}
