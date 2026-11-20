import { google } from "googleapis"
import type { analyticsdata_v1beta } from "googleapis"

import { buildGoogleJwt } from "./google-auth"
import { withTransientRetry } from "./retry"

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

/**
 * Uniform GA4 caller used by every report that touches the GA4 Data API.
 *
 * Every call goes through googleapis.analyticsdata (plain REST) with the
 * shared JWT from google-auth.ts, which adds the SEO_IMPERSONATION_USER
 * subject when set. The official @google-analytics/data SDK (gRPC-first) broke
 * three ways under Domain-Wide Delegation and was only kept for the
 * no-impersonation case; it was removed on 2026-11-21 because production
 * always impersonates and its dependency tree carried glob/minimatch advisories.
 */
export type Ga4Row = analyticsdata_v1beta.Schema$Row

export type Ga4Result = { rows: Ga4Row[] }

/**
 * Loose RunReport request shape — covers everything our consumers use today
 * (metrics, dimensions, orderBys, limit, dimensionFilter, etc.) and passes
 * through to whichever underlying SDK we resolve. We keep this loose because
 * GA4 has many optional fields and we don't want to chase the schema.
 */
export type Ga4RunReportRequest = {
  property: string
  dateRanges: { startDate: string; endDate: string }[]
  metrics?: { name: string }[]
  dimensions?: { name: string }[]
  orderBys?: any[]
  limit?: number
  dimensionFilter?: any
  metricFilter?: any
  [key: string]: any
}

export interface Ga4Caller {
  runReport(req: Ga4RunReportRequest): Promise<Ga4Result>
}

export function buildGa4Caller(): Ga4Caller {
  // Shared, token-caching JWT (see google-auth.ts) — same subject as GSC's
  // webmasters client but a distinct scope set, so it gets its own cached
  // instance. Reused across every GA4 report route.
  const jwt = buildGoogleJwt([SCOPE])
  const analyticsdata = google.analyticsdata({ version: "v1beta", auth: jwt })
  return {
    async runReport(req) {
      const { property, limit, ...rest } = req
      // Retry transient undici "Premature close" flakes on the token/API
      // fetch (see retry.ts). runReport is a read-only query — safe to retry.
      const res = await withTransientRetry(() =>
        analyticsdata.properties.runReport({
          property,
          requestBody: {
            ...rest,
            limit: limit !== undefined ? String(limit) : undefined,
          } as any,
        })
      )
      return { rows: (res.data.rows ?? []) as Ga4Row[] }
    },
  }
}
