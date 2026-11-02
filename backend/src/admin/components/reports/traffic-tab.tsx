import { Fragment, useMemo, useState } from "react"
import { Container, Heading, Table, Text } from "@medusajs/ui"

import { ReportCard } from "./report-card"
import { EmailChannelRoiChart } from "./email-channel-roi-chart"
import {
  Chips,
  HELP_GSC_CLICKS,
  HELP_GSC_IMPRESSIONS,
  HELP_GSC_POSITION,
  Kpi,
  SearchView,
  formatInt,
  usePreview,
  useSeoSummary,
} from "./search-report"
import { PALETTE } from "../../lib/reports/palette"
import { buildCsv } from "../../lib/reports/csv"
import { formatCurrency } from "../../lib/reports/format"
import { pctTrend } from "../../lib/reports/trend"
import { useReportData } from "../../lib/reports/use-report-data"
import {
  groupChannels,
  type ChannelRow,
  type EcommerceRow,
  type EngagementRow,
} from "../../lib/reports/channels"

type LandingRow = { path: string; sessions: number; engagement_rate: number }
type DeviceRow = { device: string; sessions: number; bounce_rate: number }

type AcquisitionResponse = {
  configured: boolean
  totals: { sessions: number; engaged_sessions: number; bounce_rate: number }
  source_medium: EngagementRow[]
  landing_pages: LandingRow[]
  devices: DeviceRow[]
}

type EcommerceResponse = {
  configured: boolean
  funnel: Array<{ name: string; count: number }>
  channels: EcommerceRow[]
  totals: { sessions: number; purchases: number; revenue: number; leads: number }
}

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—"

const Bar = ({ share, color = PALETTE.teal700 }: { share: number; color?: string }) => (
  <div className="h-2 rounded bg-ui-bg-subtle overflow-hidden">
    <div className="h-full" style={{ width: `${Math.max(2, share * 100)}%`, background: color }} />
  </div>
)

const SectionLabel = ({ title, note }: { title: string; note: string }) => (
  <div className="flex flex-wrap items-baseline gap-x-2 px-1">
    <Heading level="h3" className="text-sm font-semibold">
      {title}
    </Heading>
    <Text size="xsmall" className="text-ui-fg-muted">
      {note}
    </Text>
  </div>
)

const OverviewView = ({
  seo,
  acquisition,
  ecommerce,
  channels,
  loading,
  error,
}: {
  seo: ReturnType<typeof useSeoSummary>
  acquisition: AcquisitionResponse | null
  ecommerce: EcommerceResponse | null
  channels: ChannelRow[]
  loading: boolean
  error: string | null
}) => {
  const gsc = seo.summary?.gsc
  const nonBrand = gsc?.nonBrandTotals
  const priorNonBrand = gsc?.previousNonBrandTotals
  const direct = channels.find((c) => c.channel === "Direct")
  const sessions = acquisition?.totals.sessions ?? 0
  const excludingDirect = sessions - (direct?.sessions ?? 0)
  const engagedExcludingDirect =
    (acquisition?.totals.engaged_sessions ?? 0) - (direct?.engaged_sessions ?? 0)
  const funnel = ecommerce?.funnel ?? []
  const maxSessions = channels[0]?.sessions ?? 1
  const maxStep = Math.max(1, ...funnel.map((s) => s.count))

  return (
    <div className="flex flex-col gap-3">
      {gsc && nonBrand ? (
        <>
          <SectionLabel
            title="Google search"
            note="Searches that didn't use your name. Last 28 days, ending about 3 days ago."
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Clicks"
              value={formatInt(nonBrand.clicks)}
              help={HELP_GSC_CLICKS}
              trend={pctTrend(nonBrand.clicks, priorNonBrand?.clicks)}
            />
            <Kpi
              label="Impressions"
              value={formatInt(nonBrand.impressions)}
              help={HELP_GSC_IMPRESSIONS}
              trend={pctTrend(nonBrand.impressions, priorNonBrand?.impressions)}
            />
            <Kpi
              label="Average position"
              value={nonBrand.position > 0 ? nonBrand.position.toFixed(1) : "—"}
              help={HELP_GSC_POSITION}
              trend={pctTrend(nonBrand.position, priorNonBrand?.position)}
              lowerIsBetter
            />
            <Kpi
              label="Clicks from your name"
              value={formatInt(gsc.totals.clicks - nonBrand.clicks)}
              hint='Searches containing "sc prints"'
            />
          </div>
        </>
      ) : null}

      <SectionLabel title="All traffic" note="Selected date range, from Google Analytics." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Sessions excluding direct"
          value={formatInt(excludingDirect)}
          hint={`${formatInt(sessions)} including direct`}
        />
        <Kpi
          label="Engaged, excluding direct"
          value={pct(engagedExcludingDirect, excludingDirect)}
          hint={`${pct(acquisition?.totals.engaged_sessions ?? 0, sessions)} including direct`}
        />
        <Kpi label="Enquiries" value={formatInt(ecommerce?.totals.leads ?? 0)} hint="Sessions that sent a form" />
        <Kpi
          label="Purchases"
          value={formatInt(ecommerce?.totals.purchases ?? 0)}
          hint={`${formatCurrency(ecommerce?.totals.revenue ?? 0)} online, as seen by Google Analytics`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ReportCard title="Where visitors come from" loading={loading} error={error}>
          <div className="flex flex-col gap-y-2">
            {channels.map((c) => (
              <div key={c.channel} className="flex flex-col gap-y-1">
                <div className="flex items-baseline justify-between gap-x-3">
                  <Text size="small" className="font-medium">
                    {c.channel}
                  </Text>
                  <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
                    <span className="font-medium text-ui-fg-base">{formatInt(c.sessions)}</span>
                    {" · "}
                    {pct(c.engaged_sessions, c.sessions)} engaged
                  </Text>
                </div>
                <Bar share={c.sessions / maxSessions} />
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard title="From visit to purchase" loading={loading} error={error}>
          <div className="flex flex-col gap-y-2">
            {funnel.map((step, i) => (
              <div key={step.name} className="flex flex-col gap-y-1">
                <div className="flex items-baseline justify-between gap-x-3">
                  <Text size="small" className="font-medium">
                    {step.name}
                  </Text>
                  <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
                    <span className="font-medium text-ui-fg-base">{formatInt(step.count)}</span>
                    {i > 0 ? ` · ${pct(step.count, funnel[i - 1].count)} of previous step` : ""}
                  </Text>
                </div>
                <Bar share={step.count / maxStep} color={PALETTE.slate700} />
              </div>
            ))}
          </div>
        </ReportCard>
      </div>
    </div>
  )
}

const SourcesView = ({
  channels,
  fromIso,
  toIso,
  loading,
  error,
}: {
  channels: ChannelRow[]
  fromIso: string
  toIso: string
  loading: boolean
  error: string | null
}) => {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <ReportCard
        title="Traffic sources"
        caption="Click a row to see what's inside it. Unknown means Google Analytics didn't record a source."
        loading={loading}
        error={error}
        csv={
          channels.length === 0
            ? undefined
            : {
                filenameBase: "traffic-sources",
                build: () =>
                  buildCsv(
                    ["Channel", "Source", "Medium", "Sessions", "Engaged", "Cart adds", "Purchases", "Revenue"],
                    channels.flatMap((c) =>
                      c.sources.map((s) => [
                        c.channel,
                        s.source,
                        s.medium,
                        s.sessions,
                        s.engaged_sessions,
                        s.add_to_carts,
                        s.purchases,
                        s.revenue,
                      ])
                    )
                  ),
              }
        }
      >
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Channel</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Sessions</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Engaged</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Cart adds</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Purchases</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Revenue</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {channels.map((c) => (
              <Fragment key={c.channel}>
                <Table.Row
                  className="cursor-pointer"
                  onClick={() => setOpen(open === c.channel ? null : c.channel)}
                >
                  <Table.Cell className="font-medium">
                    {open === c.channel ? "▾" : "▸"} {c.channel}
                  </Table.Cell>
                  <Table.Cell className="text-right">{formatInt(c.sessions)}</Table.Cell>
                  <Table.Cell className="text-right">{pct(c.engaged_sessions, c.sessions)}</Table.Cell>
                  <Table.Cell className="text-right">{formatInt(c.add_to_carts)}</Table.Cell>
                  <Table.Cell className="text-right">{formatInt(c.purchases)}</Table.Cell>
                  <Table.Cell className="text-right">{formatCurrency(c.revenue)}</Table.Cell>
                </Table.Row>
                {open === c.channel
                  ? c.sources.map((s) => (
                      <Table.Row key={`${s.source}|${s.medium}`} className="text-ui-fg-muted">
                        <Table.Cell className="pl-8 font-mono text-xs">
                          {s.source} / {s.medium}
                        </Table.Cell>
                        <Table.Cell className="text-right">{formatInt(s.sessions)}</Table.Cell>
                        <Table.Cell className="text-right">{pct(s.engaged_sessions, s.sessions)}</Table.Cell>
                        <Table.Cell className="text-right">{formatInt(s.add_to_carts)}</Table.Cell>
                        <Table.Cell className="text-right">{formatInt(s.purchases)}</Table.Cell>
                        <Table.Cell className="text-right">{formatCurrency(s.revenue)}</Table.Cell>
                      </Table.Row>
                    ))
                  : null}
              </Fragment>
            ))}
          </Table.Body>
        </Table>
      </ReportCard>
      <EmailChannelRoiChart fromIso={fromIso} toIso={toIso} />
    </div>
  )
}

const PagesView = ({
  landing,
  devices,
  webVitals,
  loading,
  error,
}: {
  landing: LandingRow[]
  devices: DeviceRow[]
  webVitals: NonNullable<ReturnType<typeof useSeoSummary>["summary"]>["webVitals"]
  loading: boolean
  error: string | null
}) => {
  const { visible, toggle } = usePreview(landing)
  const maxSessions = landing[0]?.sessions ?? 1

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {devices.map((d) => (
          <Kpi
            key={d.device}
            label={d.device.charAt(0).toUpperCase() + d.device.slice(1)}
            value={formatInt(d.sessions)}
            hint={`${(d.bounce_rate * 100).toFixed(1)}% left without engaging`}
          />
        ))}
      </div>

      <ReportCard
        title="Entry pages"
        caption="The first page people saw, from Google Analytics for the selected date range."
        loading={loading}
        error={error}
        csv={
          landing.length === 0
            ? undefined
            : {
                filenameBase: "entry-pages",
                build: () =>
                  buildCsv(
                    ["Path", "Sessions", "Engagement rate"],
                    landing.map((r) => [r.path, r.sessions, (r.engagement_rate * 100).toFixed(1) + "%"])
                  ),
              }
        }
      >
        <div className="flex flex-col gap-y-2">
          {visible.map((r) => (
            <div key={r.path} className="flex flex-col gap-y-1">
              <div className="flex items-baseline justify-between gap-x-3">
                <Text size="small" className="truncate font-mono text-xs" title={r.path}>
                  {r.path}
                </Text>
                <Text size="xsmall" className="shrink-0 tabular-nums text-ui-fg-muted">
                  <span className="font-medium text-ui-fg-base">{formatInt(r.sessions)}</span>
                  {" · "}
                  {(r.engagement_rate * 100).toFixed(1)}% engaged
                </Text>
              </div>
              <Bar share={r.sessions / maxSessions} color={PALETTE.slate700} />
            </div>
          ))}
          {toggle}
        </div>
      </ReportCard>

      {webVitals?.length ? (
        <ReportCard
          title="Page speed"
          caption="How long the main content took to appear for real visitors in the last 7 days, by section of the site. Google's target is under 2.5s for three in four visitors. Fewer than 20 samples is only a hint."
        >
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Section</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Samples</Table.HeaderCell>
                <Table.HeaderCell className="text-right">3 in 4 visitors</Table.HeaderCell>
                <Table.HeaderCell className="text-right">9 in 10 visitors</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {webVitals.map((row) => (
                <Table.Row key={row.section}>
                  <Table.Cell>{row.section || "(unknown)"}</Table.Cell>
                  <Table.Cell className="text-right">{formatInt(row.samples)}</Table.Cell>
                  <Table.Cell
                    className="text-right"
                    style={{ color: row.lcpP75 > 2500 ? PALETTE.rose600 : PALETTE.emerald600 }}
                  >
                    {(row.lcpP75 / 1000).toFixed(2)}s
                  </Table.Cell>
                  <Table.Cell className="text-right">{(row.lcpP90 / 1000).toFixed(2)}s</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </ReportCard>
      ) : null}
    </div>
  )
}

type ViewId = "overview" | "search" | "sources" | "pages"

/** One tab for "how do people find us": replaces the old Acquisition and SEO tabs. */
export const TrafficTab = ({ fromIso, toIso }: { fromIso: string; toIso: string }) => {
  const [view, setView] = useState<ViewId>("overview")
  const seo = useSeoSummary()
  const range = { from: fromIso, to: toIso }
  const acquisition = useReportData<AcquisitionResponse>("/admin/reports/ga4-acquisition", range)
  const ecommerce = useReportData<EcommerceResponse>("/admin/reports/ga4-ecommerce", range)

  const channels = useMemo(
    () => groupChannels(acquisition.data?.source_medium ?? [], ecommerce.data?.channels ?? []),
    [acquisition.data, ecommerce.data]
  )
  const loading = acquisition.loading || ecommerce.loading
  const error = acquisition.error ?? ecommerce.error

  return (
    <div className="flex flex-col gap-3 pt-3">
      <Chips<ViewId>
        options={[
          { id: "overview", label: "Overview" },
          { id: "search", label: "Google search" },
          { id: "sources", label: "Traffic sources" },
          { id: "pages", label: "Pages & speed" },
        ]}
        value={view}
        onChange={setView}
      />

      {seo.error ? (
        <Container className="p-4">
          <Text size="small" className="text-ui-fg-error">
            Couldn't load Search Console data: {seo.error}
          </Text>
        </Container>
      ) : null}
      {seo.summary?.errors.length ? (
        <Container className="p-4">
          {seo.summary.errors.map((e, i) => (
            <Text key={i} size="small" className="text-ui-fg-error">
              {e.source.toUpperCase()}: {e.message}
            </Text>
          ))}
        </Container>
      ) : null}
      {acquisition.data && !acquisition.data.configured ? (
        <Container className="p-4">
          <Text size="small" className="text-ui-fg-subtle">
            Google Analytics isn't configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GA4_PROPERTY_ID on
            the backend.
          </Text>
        </Container>
      ) : null}

      {view === "overview" ? (
        <OverviewView
          seo={seo}
          acquisition={acquisition.data}
          ecommerce={ecommerce.data}
          channels={channels}
          loading={loading}
          error={error}
        />
      ) : null}
      {view === "search" ? <SearchView seo={seo} /> : null}
      {view === "sources" ? (
        <SourcesView channels={channels} fromIso={fromIso} toIso={toIso} loading={loading} error={error} />
      ) : null}
      {view === "pages" ? (
        <PagesView
          landing={acquisition.data?.landing_pages ?? []}
          devices={acquisition.data?.devices ?? []}
          webVitals={seo.summary?.webVitals}
          loading={acquisition.loading}
          error={acquisition.error}
        />
      ) : null}
    </div>
  )
}
