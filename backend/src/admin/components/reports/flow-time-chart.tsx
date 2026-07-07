import { Text } from "@medusajs/ui"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ReportCard } from "./report-card"
import { PALETTE } from "../../lib/reports/palette"
import { buildCsv } from "../../lib/reports/csv"
import { useReportData } from "../../lib/reports/use-report-data"

type BinRow = { bin_label: string; count: number }

type Response = {
  from: string
  to: string
  sample_size: number
  median_days: number
  p90_days: number
  histogram: BinRow[]
}

export const FlowTimeChart = ({
  fromIso,
  toIso,
  regionId,
}: {
  fromIso: string
  toIso: string
  regionId: string | null
}) => {
  const { data, loading, error } = useReportData<Response>("/admin/reports/flow-time", {
    from: fromIso,
    to: toIso,
    region_id: regionId,
  })


  const rows = data?.histogram ?? []
  const isEmpty = !loading && !error && (data?.sample_size ?? 0) === 0

  return (
    <ReportCard
      title="Total flow time distribution"
      caption={
        data && data.sample_size > 0
          ? `Received → shipped end-to-end. Median ${data.median_days}d · p90 ${data.p90_days}d · ${data.sample_size} completed orders`
          : "End-to-end production time for orders that shipped in the selected window."
      }
      help={{
        title: "Total flow time",
        body: "End-to-end time from when an order entered the 'received' stage to when it was moved to 'shipped' (or 'delivered'). Only completed orders that shipped within the date window are counted.",
        bullets: [
          "Median is your typical turnaround promise. p90 is what 1 in 10 customers actually experiences.",
          "A long right tail suggests a class of orders (complex art, custom blanks) that systematically takes longer — consider a separate SLA track for those.",
          "Extend the date window if the sample is small — only shipped orders in that window are included.",
          "Compare against the Time-in-Stage chart to identify which single stage is adding the most flow time.",
        ],
      }}
      loading={loading}
      error={error}
      csv={
        rows.length === 0
          ? undefined
          : {
              filenameBase: "flow-time-distribution",
              build: () =>
                buildCsv(
                  ["Days bucket", "Orders"],
                  rows.map((r) => [r.bin_label, r.count])
                ),
            }
      }
    >
      {isEmpty ? (
        <Text size="small" className="text-ui-fg-muted py-4 text-center">
          No orders with both a received and shipped stage in this window.
        </Text>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid stroke={PALETTE.stone200} strokeDasharray="3 3" />
              <XAxis
                dataKey="bin_label"
                tick={{ fontSize: 11, fill: PALETTE.slate500 }}
                stroke={PALETTE.stone400}
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
                formatter={(value: any) => [`${value} orders`, "Count"]}
              />
              <Bar
                dataKey="count"
                fill={PALETTE.teal700}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ReportCard>
  )
}
