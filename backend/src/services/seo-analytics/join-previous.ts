import type { GscRow } from "./types"

/**
 * Attach each current row's prior-window counterpart (matched by `key`) as
 * `previous`, so the dashboard can draw per-row trend arrows. Rows with no
 * prior match (new queries/pages) are returned unchanged.
 */
export function attachPrevious(current: GscRow[], previous: GscRow[]): GscRow[] {
  const prevByKey = new Map(previous.map((r) => [r.key, r]))
  return current.map((r) => {
    const p = prevByKey.get(r.key)
    if (!p) return r
    return {
      ...r,
      previous: {
        clicks: p.clicks,
        impressions: p.impressions,
        ctr: p.ctr,
        position: p.position,
      },
    }
  })
}
