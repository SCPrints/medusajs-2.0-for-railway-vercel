import { runHogQL } from "../posthog-stats"
import type { WebVitalsRow } from "./types"

/**
 * LCP p75/p90 by path section (first two path segments, e.g. "/au/products")
 * from PostHog's `$web_vitals` events over the last `days` days. Rides along
 * with the SEO summary so the fortnightly review has page speed next to
 * rankings — LCP is a ranking input and the Sept 2026 tail lived on PDPs.
 */
export async function fetchWebVitalsBySection(days = 7): Promise<WebVitalsRow[]> {
  const rows = await runHogQL<string | number>(`
    SELECT
      arrayStringConcat(arraySlice(splitByChar('/', properties.$pathname), 1, 3), '/') AS section,
      count() AS samples,
      round(quantile(0.75)(toFloat(properties.$web_vitals_LCP_value))) AS p75,
      round(quantile(0.9)(toFloat(properties.$web_vitals_LCP_value))) AS p90
    FROM events
    WHERE event = '$web_vitals'
      AND timestamp > now() - interval ${Math.max(1, Math.floor(days))} day
      AND properties.$web_vitals_LCP_value IS NOT NULL
    GROUP BY section
    ORDER BY samples DESC
    LIMIT 12
  `)
  return rows.map((r) => ({
    section: String(r[0] ?? ""),
    samples: Number(r[1] ?? 0),
    lcpP75: Number(r[2] ?? 0),
    lcpP90: Number(r[3] ?? 0),
  }))
}
