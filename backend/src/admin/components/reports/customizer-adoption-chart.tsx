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
import { KpiTile } from "./kpi-tile"

type Response = {
  from: string
  to: string
  series: Array<{
    week_start: string
    customized: number
    blank: number
  }>
  summary: {
    total_orders: number
    customized_orders: number
    adoption_rate: number
    prior_total_orders: number
    prior_customized_orders: number
    prior_adoption_rate: number
    delta_pct_points: number
  }
}

export const CustomizerAdoptionChart = ({
  fromIso,
  toIso,
regionId,
}: {
  fromIso: string
  toIso: string
  regionId: string | null
}) => {
  const { data, loading, error } = useReportData<Response>("/admin/reports/customizer-adoption", {
    from: fromIso,
    to: toIso,
    region_id: regionId,
  })


  const summary = data?.summary
  const adoptionPct =
    summary && summary.total_orders > 0
      ? Math.round(summary.adoption_rate * 1000) / 10
      : 0
  const delta = summary
    ? {
        pp: summary.delta_pct_points,
        positive: summary.delta_pct_points >= 0,
      }
    : null

  return (
    <ReportCard
      title="Customizer adoption"
      caption="Share of orders that include at least one customised line. Trend up = the customizer is paying off; flat or declining = check drop-off."
      help={{
        title: "Customizer adoption",
        body: "Of every order placed in the window, what share contains at least one line built in the customizer (vs a plain catalogue product). The customizer is your main differentiator — adoption is the leading indicator of its health.",
        bullets: [
          "Rising adoption = the customizer is paying off; promote it further on the homepage and PDPs.",
          "Flat or declining adoption while traffic grows = customers are landing but not engaging the customizer. Check the funnel chart below for where they drop off.",
          "An order counts as customised if any line carries metadata.type = 'fabric_customizer' (the marker the cart-add helper writes).",
        ],
      }}
      loading={loading}
      error={error}
      csv={
        !data || data.series.length === 0
          ? undefined
          : {
              filenameBase: "customizer-adoption",
              build: () =>
                buildCsv(
                  ["Week start", "Customised orders", "Blank orders", "Total"],
                  data.series.map((s) => [
                    s.week_start,
                    s.customized,
                    s.blank,
                    s.customized + s.blank,
                  ])
                ),
            }
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <KpiTile
          label="Adoption (period)"
          value={`${adoptionPct.toFixed(1)}%`}
          delta={summary && summary.prior_total_orders > 0 ? delta : null}
        />
        <KpiTile
          label="Customised orders"
          value={String(summary?.customized_orders ?? 0)}
        />
        <KpiTile
          label="Total orders"
          value={String(summary?.total_orders ?? 0)}
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
              tickFormatter={(v: string) => v.slice(5)} // show MM-DD
            />
            <YAxis
              tick={{ fontSize: 11, fill: PALETTE.slate500 }}
              stroke={PALETTE.stone400}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: PALETTE.stone50,
                border: `1px solid ${PALETTE.stone200}`,
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="square"
            />
            <Bar
              dataKey="customized"
              stackId="a"
              fill={PALETTE.slate700}
              name="Customised"
              maxBarSize={28}
            />
            <Bar
              dataKey="blank"
              stackId="a"
              fill={PALETTE.stone300}
              name="Blank"
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ReportCard>
  )
}
