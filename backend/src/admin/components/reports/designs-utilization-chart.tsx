import { Text } from "@medusajs/ui"

import { ReportCard } from "./report-card"
import { useReportData } from "../../lib/reports/use-report-data"
import { KpiTile } from "./kpi-tile"

type Response = {
  from: string
  to: string
  summary: {
    designs_created: number
    designs_reused: number
    active_customers: number
    reuse_rate: number
  }
  top_customers_by_design_count: Array<{ customer_id: string; count: number }>
  module_available: boolean
}

export const DesignsUtilizationChart = ({
  fromIso,
  toIso,
regionId,
}: {
  fromIso: string
  toIso: string
  regionId: string | null
}) => {
  const { data, loading, error } = useReportData<Response>("/admin/reports/designs-utilization", {
    from: fromIso,
    to: toIso,
    region_id: regionId,
  })


  const summary = data?.summary
  const reusePct = summary ? (summary.reuse_rate * 100).toFixed(1) : "0.0"

  return (
    <ReportCard
      title="My Designs feature utilization"
      caption="Designs the customer saved to their personal library. Reuse rate measures whether saved designs translate into repeat orders — Phase 2 success signal."
      help={{
        title: "My Designs feature utilization",
        body: "Two angles on the saved-designs feature: how many designs customers have saved to their personal library, and what share of those saved designs end up purchased (reuse rate).",
        bullets: [
          "High saves + low reuse = customers are parking designs as a 'maybe-later' but not coming back. The reorder reminder cron is the right tool to nudge them.",
          "Low saves overall = the 'Save to my designs' button isn't visible enough or its value isn't clear. Worth A/B testing the affordance.",
          "Reuse rate >40% means the feature is genuinely earning its keep — push it harder on the customizer landing.",
        ],
      }}
      loading={loading}
      error={error}
    >
      {data && !data.module_available ? (
        <Text size="xsmall" className="text-ui-fg-muted">
          The designs module isn't registered on this backend.
        </Text>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Designs created"
            value={String(summary?.designs_created ?? 0)}
          />
          <KpiTile
            label="Reused designs"
            value={String(summary?.designs_reused ?? 0)}
          />
          <KpiTile label="Reuse rate" value={`${reusePct}%`} />
          <KpiTile
            label="Active customers"
            value={String(summary?.active_customers ?? 0)}
          />
        </div>
      )}
    </ReportCard>
  )
}
