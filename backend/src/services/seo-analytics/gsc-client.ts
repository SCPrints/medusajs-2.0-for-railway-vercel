import { google } from "googleapis"

import { buildGoogleJwt } from "./google-auth"
import { attachPrevious } from "./join-previous"
import { withTransientRetry } from "./retry"
import type { GscRow, GscSummary } from "./types"

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
const TOP_ROW_LIMIT = 25
// Wider net for the prior window so most current top-25 keys find a match to
// trend against; unmatched keys just show no arrow.
const PREV_MATCH_LIMIT = 250
// Local-SEO tracking pulls a deep list so every /locations/* page and every
// suburb/uniform/embroidery query is caught, not just the top 25.
const TRACK_ROW_LIMIT = 1000
const LOCAL_PAGE_PATTERN = /\/locations(\/|$)/
/** Queries the local-SEO work targets: services × catchment suburbs + Sydney. */
export const TRACKED_QUERY_PATTERN =
  /\b(embroider|uniform|workwear|hi[- ]?vis|screen print|dtf|t[- ]?shirt print)/i
/**
 * Brand searches ("sc prints", "scprints", "sc printing"). RE2 syntax — GSC
 * applies it server-side. Non-brand is derived as total − brand rather than
 * via excludingRegex: any query filter drops GSC's anonymised (rare) queries,
 * which are ~2/3 of our clicks and almost all non-brand.
 */
export const BRAND_QUERY_REGEX = "(?i)\\bsc\\s*print"
const TRACKED_PLACE_PATTERN =
  /\b(liverpool|bankstown|prestons|chipping norton|fairfield|cabramatta|villawood|parramatta|wetherill|sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|darwin|newcastle|wollongong|central coast|gold coast|sunshine coast|geelong|townsville|cairns|near me)\b/i

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildClient() {
  // buildGoogleJwt centralises the JWT construction including the DWD
  // `subject` field — see google-auth.ts.
  const jwt = buildGoogleJwt([SCOPE])
  return google.searchconsole({ version: "v1", auth: jwt })
}

async function queryDimensions(
  searchconsole: ReturnType<typeof buildClient>,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
  brandOnlyRegex?: string
): Promise<GscRow[]> {
  const res = await withTransientRetry(() =>
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        rowLimit,
        ...(brandOnlyRegex && {
          dimensionFilterGroups: [
            {
              filters: [
                { dimension: "query", operator: "includingRegex", expression: brandOnlyRegex },
              ],
            },
          ],
        }),
      },
    })
  )
  const rows = res.data.rows ?? []
  return rows.map((r) => ({
    key: (r.keys ?? []).join(" › "),
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    ctr: r.ctr ?? 0,
    position: r.position ?? 0,
  }))
}

// Impression-weighted totals from date-dimensioned rows (each row's `position`
// is itself impression-weighted within that day, so this is a correct rollup).
function totalsFromDateRows(rows: GscRow[]): GscSummary["totals"] {
  let clicks = 0
  let impressions = 0
  let positionWeighted = 0
  for (const r of rows) {
    clicks += r.clicks
    impressions += r.impressions
    positionWeighted += r.position * r.impressions
  }
  const ctr = impressions > 0 ? clicks / impressions : 0
  const position = impressions > 0 ? positionWeighted / impressions : 0
  return { clicks, impressions, ctr, position }
}

/** all − part, with position un-weighted back out of the impression-weighted mean. */
export function subtractTotals(
  all: GscSummary["totals"],
  part: GscSummary["totals"]
): GscSummary["totals"] {
  const clicks = Math.max(0, all.clicks - part.clicks)
  const impressions = Math.max(0, all.impressions - part.impressions)
  const position =
    impressions > 0
      ? (all.position * all.impressions - part.position * part.impressions) / impressions
      : 0
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position }
}

/**
 * Pulls a 28-day (or `days`) window of GSC Search Analytics for a single site.
 * Returns top queries, top pages, daily totals, and overall totals — plus the
 * immediately-preceding window's totals so the dashboard can show trend arrows.
 */
export async function fetchGscSummary(
  siteUrl: string,
  days: number
): Promise<GscSummary> {
  const searchconsole = buildClient()
  const endDate = todayIso()
  const startDate = isoDaysAgo(days)
  // Prior window: the `days` immediately before the current one, no overlap.
  const prevEndDate = isoDaysAgo(days + 1)
  const prevStartDate = isoDaysAgo(days * 2)

  const [
    topQueries,
    topPages,
    byDayRaw,
    prevByDayRaw,
    prevQueries,
    prevPages,
    allQueries,
    allPages,
    prevAllQueries,
    prevAllPages,
    brandByDay,
    prevBrandByDay,
  ] = await Promise.all([
    queryDimensions(searchconsole, siteUrl, startDate, endDate, ["query"], TOP_ROW_LIMIT),
    queryDimensions(searchconsole, siteUrl, startDate, endDate, ["page"], TOP_ROW_LIMIT),
    queryDimensions(searchconsole, siteUrl, startDate, endDate, ["date"], days + 5),
    queryDimensions(searchconsole, siteUrl, prevStartDate, prevEndDate, ["date"], days + 5),
    queryDimensions(searchconsole, siteUrl, prevStartDate, prevEndDate, ["query"], PREV_MATCH_LIMIT),
    queryDimensions(searchconsole, siteUrl, prevStartDate, prevEndDate, ["page"], PREV_MATCH_LIMIT),
    queryDimensions(searchconsole, siteUrl, startDate, endDate, ["query"], TRACK_ROW_LIMIT),
    queryDimensions(searchconsole, siteUrl, startDate, endDate, ["page"], TRACK_ROW_LIMIT),
    queryDimensions(searchconsole, siteUrl, prevStartDate, prevEndDate, ["query"], TRACK_ROW_LIMIT),
    queryDimensions(searchconsole, siteUrl, prevStartDate, prevEndDate, ["page"], TRACK_ROW_LIMIT),
    queryDimensions(searchconsole, siteUrl, startDate, endDate, ["date"], days + 5, BRAND_QUERY_REGEX),
    queryDimensions(searchconsole, siteUrl, prevStartDate, prevEndDate, ["date"], days + 5, BRAND_QUERY_REGEX),
  ])

  const byDay = byDayRaw
    .map((r) => ({ date: r.key, clicks: r.clicks, impressions: r.impressions }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const byImpressions = (a: GscRow, b: GscRow) => b.impressions - a.impressions
  const isTracked = (q: string) =>
    TRACKED_QUERY_PATTERN.test(q) && TRACKED_PLACE_PATTERN.test(q)

  // Pages that dropped out this window still matter (a suburb page losing all
  // impressions is the signal) — so union prior-window-only pages in as zero rows.
  const localCurrent = allPages.filter((r) => LOCAL_PAGE_PATTERN.test(r.key))
  const seen = new Set(localCurrent.map((r) => r.key))
  const localDropped = prevAllPages
    .filter((r) => LOCAL_PAGE_PATTERN.test(r.key) && !seen.has(r.key))
    .map((r) => ({ key: r.key, clicks: 0, impressions: 0, ctr: 0, position: 0 }))

  return {
    totals: totalsFromDateRows(byDayRaw),
    previousTotals: totalsFromDateRows(prevByDayRaw),
    nonBrandTotals: subtractTotals(totalsFromDateRows(byDayRaw), totalsFromDateRows(brandByDay)),
    previousNonBrandTotals: subtractTotals(
      totalsFromDateRows(prevByDayRaw),
      totalsFromDateRows(prevBrandByDay)
    ),
    topQueries: attachPrevious(topQueries, prevQueries),
    topPages: attachPrevious(topPages, prevPages),
    byDay,
    localPages: attachPrevious([...localCurrent, ...localDropped], prevAllPages).sort(
      byImpressions
    ),
    trackedQueries: attachPrevious(
      allQueries.filter((r) => isTracked(r.key)),
      prevAllQueries
    )
      .sort(byImpressions)
      .slice(0, 40),
  }
}
