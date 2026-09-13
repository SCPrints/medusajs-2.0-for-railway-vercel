export type SeoSummaryStatus = "ok" | "partial" | "error" | "empty"

export type GscRow = {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  // Same query/page's metrics in the prior window (matched by key). Absent when
  // the row is new this window — the UI then shows no trend arrow.
  previous?: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
}

export type GscByDay = {
  date: string
  clicks: number
  impressions: number
}

export type GscSummary = {
  totals: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  // Totals for the immediately-preceding window of equal length — drives the
  // dashboard trend arrows. Optional so cache entries written before this
  // existed still deserialise (no trend shown until the next refresh).
  previousTotals?: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
  topQueries: GscRow[]
  topPages: GscRow[]
  byDay: GscByDay[]
  // Local-SEO tracking (added 2026-09-14). Every /locations/* page, and the
  // queries matching TRACKED_QUERY_PATTERN, each with prior-window trend —
  // the fortnightly "did the suburb work move?" review without opening GSC.
  // Optional so cache entries written before this existed still deserialise.
  localPages?: GscRow[]
  trackedQueries?: GscRow[]
}

export type WebVitalsRow = {
  /** Path prefix, e.g. "/au/products". */
  section: string
  samples: number
  lcpP75: number
  lcpP90: number
}

export type Ga4PageRow = {
  path: string
  sessions: number
  conversions: number
}

export type Ga4ByDay = {
  date: string
  sessions: number
}

export type Ga4Summary = {
  totals: {
    sessions: number
    conversions: number
    engagedSessions: number
    averageSessionDuration: number
  }
  topPages: Ga4PageRow[]
  byDay: Ga4ByDay[]
}

export type SeoSourceFailure = {
  source: "gsc" | "ga4" | "posthog"
  message: string
}

export type SeoSummary = {
  status: SeoSummaryStatus
  generated_at: string
  range: { days: number; start: string; end: string }
  gsc: GscSummary | null
  ga4: Ga4Summary | null
  /** PostHog $web_vitals LCP by section, last 7 days. Null when PostHog isn't configured. */
  webVitals?: WebVitalsRow[] | null
  errors: SeoSourceFailure[]
}
