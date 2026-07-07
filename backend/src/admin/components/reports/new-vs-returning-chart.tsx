import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ReportCard } from "./report-card"
import { PALETTE } from "../../lib/reports/palette"
import { buildCsv } from "../../lib/reports/csv"
import { useReportData } from "../../lib/reports/use-report-data"
import { formatCurrency } from "../../lib/reports/format"
import { KpiTile } from "./kpi-tile"

type Response = {
  from: string
  to: string
  currency: string
  summary: {
    new_revenue: number
    new_orders: number
    returning_revenue: number
    returning_orders: number
    total_revenue: number
    returning_revenue_share: number
    prior_new_revenue: number
    prior_returning_revenue: number
    new_revenue_delta_pct: number | null
    returning_revenue_delta_pct: number | null
  }
  series: Array<{
    week_start: string
    new_revenue: number
    new_orders: number
    returning_revenue: number
    returning_orders: number
  }>
}

export const NewVsReturningChart = ({
  fromIso,
  toIso,
  regionId,
}: {
  fromIso: string
  toIso: string
  regionId: string | null
}) => {
  const { data, loading, error } = useReportData<Response>("/admin/reports/new-vs-returning", {
    from: fromIso,
    to: toIso,
    region_id: regionId,
  })


  const summary = data?.summary
  const currency = data?.currency ?? "aud"
  const returningSharePct = summary
    ? (summary.returning_revenue_share * 100).toFixed(1)
    : "0.0"

  return (
    <ReportCard
      title="New vs returning customer revenue"
      caption="Where the money's coming from: first-time buyers vs. repeat customers. A low returning-revenue share means you're treadmilling on acquisition; spend more on retention."
      help={{
        title: "New vs returning customer revenue",
        body: "Splits weekly revenue between customers placing their first-ever order vs customers ordering again. The healthy mix depends on your stage — too much either way is a warning.",
        bullets: [
          "Returning revenue <30% = you're treadmilling. Acquisition is doing the heavy lifting; first-order experience needs work to convert one-and-done buyers.",
          "Returning revenue >70% = great retention but acquisition is anaemic. Healthy short-term but you're not adding customers to replace natural attrition.",
          "Rising returning share over months is the strongest signal a store is compounding — new customers acquired earlier are now generating reorders.",
        ],
      }}
      loading={loading}
      error={error}
      csv={
        !data || data.series.length === 0
          ? undefined
          : {
              filenameBase: "new-vs-returning",
              build: () =>
                buildCsv(
                  [
                    "Week start",
                    "New revenue",
                    "New orders",
                    "Returning revenue",
                    "Returning orders",
                  ],
                  data.series.map((s) => [
                    s.week_start,
                    s.new_revenue,
                    s.new_orders,
                    s.returning_revenue,
                    s.returning_orders,
                  ])
                ),
            }
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="New revenue"
          value={formatCurrency(summary?.new_revenue ?? 0, currency)}
          delta={summary?.new_revenue_delta_pct ?? null}
        />
        <KpiTile
          label="Returning revenue"
          value={formatCurrency(summary?.returning_revenue ?? 0, currency)}
          delta={summary?.returning_revenue_delta_pct ?? null}
        />
        <KpiTile
          label="Returning revenue share"
          value={`${returningSharePct}%`}
        />
        <KpiTile
          label="New / returning orders"
          value={`${summary?.new_orders ?? 0} / ${summary?.returning_orders ?? 0}`}
        />
      </div>
      <div className="h-64 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.series ?? []}
            margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
          >
            <CartesianGrid stroke={PALETTE.stone200} strokeDasharray="3 3" />
            <XAxis
              dataKey="week_start"
              tick={{ fontSize: 10, fill: PALETTE.slate500 }}
              stroke={PALETTE.stone400}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: PALETTE.slate500 }}
              stroke={PALETTE.stone400}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
              }
            />
            <Tooltip
              contentStyle={{
                background: PALETTE.stone50,
                border: `1px solid ${PALETTE.stone200}`,
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value: any, name: string) => {
                const label = name === "new_revenue" ? "New" : "Returning"
                return [formatCurrency(Number(value), currency), label]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
            <Bar
              dataKey="new_revenue"
              stackId="a"
              fill={PALETTE.slate500}
              name="New"
              maxBarSize={28}
            />
            <Bar
              dataKey="returning_revenue"
              stackId="a"
              fill={PALETTE.teal700}
              name="Returning"
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ReportCard>
  )
}
