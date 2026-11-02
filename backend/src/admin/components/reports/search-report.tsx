import { Button, Container, Table, Text } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { HelpTooltip, type HelpContent } from "./help-tooltip"
import { PALETTE } from "../../lib/reports/palette"
import { pctTrend, type Trend } from "../../lib/reports/trend"

export type GscRow = {
  key: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  previous?: { clicks: number; impressions: number; ctr: number; position: number }
}

type GscTotals = { clicks: number; impressions: number; ctr: number; position: number }

export type SeoSummary = {
  status: "ok" | "partial" | "error" | "empty"
  generated_at: string
  range: { days: number; start: string; end: string }
  gsc: {
    totals: GscTotals
    previousTotals?: GscTotals
    nonBrandTotals?: GscTotals
    previousNonBrandTotals?: GscTotals
    topQueries: GscRow[]
    topPages: GscRow[]
    localPages?: GscRow[]
    trackedQueries?: GscRow[]
  } | null
  webVitals?: Array<{ section: string; samples: number; lcpP75: number; lcpP90: number }> | null
  errors: Array<{ source: "gsc" | "ga4" | "posthog"; message: string }>
}

type Envelope = { status: SeoSummary["status"]; summary: SeoSummary | null }

const adminFetchPath = (path: string) => {
  const base = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "")
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

/** The cached Search Console + page-speed summary (daily cron, or Refresh now). */
export const useSeoSummary = () => {
  const [envelope, setEnvelope] = useState<Envelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const request = useCallback(async (path: string, init?: RequestInit) => {
    setError(null)
    try {
      const res = await fetch(adminFetchPath(path), { credentials: "include", ...init })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`)
      setEnvelope((await res.json()) as Envelope)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    }
  }, [])

  useEffect(() => {
    request("/admin/seo-analytics").finally(() => setLoading(false))
  }, [request])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await request("/admin/seo-analytics/refresh", { method: "POST" })
    setRefreshing(false)
  }, [request])

  return { status: envelope?.status, summary: envelope?.summary ?? null, loading, refreshing, error, refresh }
}

const numberFmt = new Intl.NumberFormat("en-AU")
export const formatInt = (n: number) => numberFmt.format(Math.round(n))
const formatPct = (n: number) => `${(n * 100).toFixed(2)}%`
const formatPosition = (n: number) => (n > 0 ? n.toFixed(1) : "—")

const trendColor = (dir: Trend["dir"]) =>
  dir === "up" ? PALETTE.emerald600 : dir === "down" ? PALETTE.rose600 : undefined

const TrendLine = ({ trend, lowerIsBetter = false }: { trend: Trend; lowerIsBetter?: boolean }) => {
  // For rank-style metrics (average position) a FALLING number is the good
  // outcome, so colour + arrow follow "better / worse", not raw direction.
  const better = lowerIsBetter ? trend.dir === "down" : trend.dir === "up"
  const arrow = trend.dir === "flat" ? "•" : better ? "▲" : "▼"
  const color = trend.dir === "flat" ? undefined : trendColor(better ? "up" : "down")
  const verb = lowerIsBetter && trend.dir !== "flat" ? (better ? "better " : "worse ") : ""
  return (
    <Text
      size="xsmall"
      className={trend.dir === "flat" ? "text-ui-fg-muted" : undefined}
      style={color ? { color } : undefined}
    >
      {arrow} {verb}{trend.text} vs prior 28d
    </Text>
  )
}

// Compact per-table-cell trend: a small coloured arrow with the % in the
// tooltip. Nothing renders when there's no comparable prior or the move is flat,
// so tables only light up where a metric genuinely shifted.
const CellDelta = ({
  curr,
  prior,
  lowerIsBetter = false,
}: {
  curr: number
  prior?: number
  /** Position columns: a smaller number is an improvement (moved up the page). */
  lowerIsBetter?: boolean
}) => {
  const t = pctTrend(curr, prior)
  if (!t || t.dir === "flat") return null
  const better = lowerIsBetter ? t.dir === "down" : t.dir === "up"
  const label = lowerIsBetter
    ? `${better ? "improved" : "worsened"} ${t.text} vs prior 28d (was ${prior?.toFixed(1)})`
    : `${t.dir === "up" ? "up" : "down"} ${t.text} vs prior 28d`
  return (
    <span className="ml-1 text-xs" style={{ color: trendColor(better ? "up" : "down") }} title={label}>
      {better ? "▲" : "▼"}
    </span>
  )
}

export const Kpi = ({
  label,
  value,
  hint,
  help,
  trend,
  lowerIsBetter = false,
}: {
  label: string
  value: string
  hint?: string
  help?: HelpContent
  trend?: Trend | null
  lowerIsBetter?: boolean
}) => (
  <div className="flex flex-col gap-1 rounded-md border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
    <Text size="xsmall" className="text-ui-fg-muted flex items-center">
      {label}
      {help ? <HelpTooltip text={help} size={12} /> : null}
    </Text>
    <Text size="large" weight="plus">
      {value}
    </Text>
    {trend ? <TrendLine trend={trend} lowerIsBetter={lowerIsBetter} /> : null}
    {hint ? (
      <Text size="xsmall" className="text-ui-fg-muted">
        {hint}
      </Text>
    ) : null}
  </div>
)

const ColumnHeader = ({ children, help }: { children: ReactNode; help?: HelpContent }) => (
  <span className="inline-flex items-center justify-end">
    {children}
    {help ? <HelpTooltip text={help} size={12} /> : null}
  </span>
)

const HELP_GSC_CTR: HelpContent = {
  title: "Click-through rate",
  body: "Of every 100 times this query/page appeared in Google search results, how many times someone actually clicked through. CTR depends on rank, snippet, and competitive context.",
  bullets: [
    "Position 1 typically earns 25–35% CTR; position 5 around 5%; below position 10 it falls under 2%.",
    "A drop with no position change usually means a competitor changed their snippet, so refresh your meta description.",
  ],
}

export const HELP_GSC_POSITION: HelpContent = {
  title: "Average position",
  body: "Where, on average, this query/page ranked in Google search results during the window. Lower number = higher up the page; 1 means the very top result.",
  bullets: [
    "Position averages across every search where the URL appeared, including position 90 long-tail mentions, so a poor average can hide some great rankings.",
    "Position improvements usually take 4–8 weeks to reflect after content changes.",
  ],
}

export const HELP_GSC_CLICKS: HelpContent = {
  title: "Clicks",
  body: "Clicks from Google search results to this query/page during the window. The only search metric that turns directly into traffic.",
}

export const HELP_GSC_IMPRESSIONS: HelpContent = {
  title: "Impressions",
  body: "How many times your URL appeared in Google search results in the window, whether or not the user clicked.",
  bullets: [
    "Rising impressions + flat clicks usually means you're showing for new searches but not ranking high enough for them yet.",
    "Falling impressions = lost rankings or fewer searches in the topic.",
  ],
}

const GscRowsTable = ({ rows, firstColumn, stripOrigin }: { rows: GscRow[]; firstColumn: string; stripOrigin: boolean }) => (
  <Table>
    <Table.Header>
      <Table.Row>
        <Table.HeaderCell>{firstColumn}</Table.HeaderCell>
        <Table.HeaderCell className="text-right">
          <ColumnHeader help={HELP_GSC_CLICKS}>Clicks</ColumnHeader>
        </Table.HeaderCell>
        <Table.HeaderCell className="text-right">
          <ColumnHeader help={HELP_GSC_IMPRESSIONS}>Impressions</ColumnHeader>
        </Table.HeaderCell>
        <Table.HeaderCell className="text-right">
          <ColumnHeader help={HELP_GSC_CTR}>CTR</ColumnHeader>
        </Table.HeaderCell>
        <Table.HeaderCell className="text-right">
          <ColumnHeader help={HELP_GSC_POSITION}>Position</ColumnHeader>
        </Table.HeaderCell>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {rows.map((row, i) => (
        <Table.Row key={`${row.key}-${i}`}>
          <Table.Cell className="max-w-[44ch] truncate" title={row.key}>
            {(stripOrigin ? row.key.replace(/^https?:\/\/[^/]+/, "") : row.key) || "(unknown)"}
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(row.clicks)}
            <CellDelta curr={row.clicks} prior={row.previous?.clicks} />
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatInt(row.impressions)}
            <CellDelta curr={row.impressions} prior={row.previous?.impressions} />
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatPct(row.ctr)}
            <CellDelta curr={row.ctr} prior={row.previous?.ctr} />
          </Table.Cell>
          <Table.Cell className="text-right">
            {formatPosition(row.position)}
            <CellDelta curr={row.position} prior={row.previous?.position} lowerIsBetter />
          </Table.Cell>
        </Table.Row>
      ))}
    </Table.Body>
  </Table>
)

/** Row of small toggle buttons. Used for every "pick a view" control on this tab. */
export const Chips = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
}) => (
  <div className="flex flex-wrap gap-1">
    {options.map((o) => (
      <Button
        key={o.id}
        size="small"
        variant={o.id === value ? "secondary" : "transparent"}
        onClick={() => onChange(o.id)}
      >
        {o.label}
      </Button>
    ))}
  </div>
)

const PREVIEW_ROWS = 10

/** First few rows of a list, with a button for the rest. */
export const usePreview = <T,>(rows: T[]) => {
  const [expanded, setExpanded] = useState(false)
  return {
    visible: expanded ? rows : rows.slice(0, PREVIEW_ROWS),
    toggle:
      rows.length > PREVIEW_ROWS ? (
        <Button size="small" variant="transparent" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      ) : null,
  }
}

type DatasetId = "queries" | "pages" | "local_pages" | "local_queries"
type FilterId = "all" | "near" | "losing"

// Page 1 ends at position 10. Rows just outside it (or low on it) are the ones
// where a better page can realistically move the number.
const isNearPageOne = (r: GscRow) => r.position > 5 && r.position <= 20
const isLosingClicks = (r: GscRow) => (r.previous?.clicks ?? 0) > r.clicks

export const SearchView = ({
  seo,
}: {
  seo: ReturnType<typeof useSeoSummary>
}) => {
  const [dataset, setDataset] = useState<DatasetId>("queries")
  const [filter, setFilter] = useState<FilterId>("all")
  const gsc = seo.summary?.gsc

  const datasets: Array<{ id: DatasetId; label: string; rows: GscRow[]; column: string }> = gsc
    ? [
        { id: "queries", label: "Searches", rows: gsc.topQueries, column: "Search" },
        { id: "pages", label: "Pages", rows: gsc.topPages, column: "Page" },
        { id: "local_pages", label: "Suburb pages", rows: gsc.localPages ?? [], column: "Page" },
        { id: "local_queries", label: "Local searches", rows: gsc.trackedQueries ?? [], column: "Search" },
      ]
    : []
  const active = datasets.find((d) => d.id === dataset)

  const rows = useMemo(() => {
    const all = active?.rows ?? []
    if (filter === "near") {
      return all.filter(isNearPageOne).sort((a, b) => b.impressions - a.impressions)
    }
    if (filter === "losing") {
      return all
        .filter(isLosingClicks)
        .sort((a, b) => b.previous!.clicks - b.clicks - (a.previous!.clicks - a.clicks))
    }
    return all
  }, [active, filter])
  const { visible, toggle } = usePreview(rows)

  const lastRefreshed = seo.summary?.generated_at
    ? new Date(seo.summary.generated_at).toLocaleString("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null

  return (
    <Container className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Text size="xsmall" className="text-ui-fg-muted">
          Always the last 28 days from Search Console, ending about 3 days ago. The date range above
          doesn't change this view.{lastRefreshed ? ` Last refreshed ${lastRefreshed}.` : ""}
        </Text>
        <Button size="small" variant="secondary" onClick={seo.refresh} isLoading={seo.refreshing}>
          Refresh now
        </Button>
      </div>

      {gsc ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Chips<DatasetId>
              options={datasets.map((d) => ({ id: d.id, label: d.label }))}
              value={dataset}
              onChange={setDataset}
            />
            <Chips<FilterId>
              options={[
                { id: "all", label: "All" },
                { id: "near", label: "Close to page 1" },
                { id: "losing", label: "Losing clicks" },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          {filter === "near" ? (
            <Text size="xsmall" className="text-ui-fg-muted">
              Average position 5–20, most-seen first. These are the best candidates for a better page.
            </Text>
          ) : null}
          {visible.length ? (
            <GscRowsTable
              rows={visible}
              firstColumn={active?.column ?? ""}
              stripOrigin={dataset === "pages" || dataset === "local_pages"}
            />
          ) : (
            <Text size="small" className="text-ui-fg-muted">
              Nothing matches this view.
            </Text>
          )}
          {toggle}
        </>
      ) : !seo.loading ? (
        <Text size="small" className="text-ui-fg-muted">
          No Search Console data yet.
        </Text>
      ) : null}
    </Container>
  )
}
