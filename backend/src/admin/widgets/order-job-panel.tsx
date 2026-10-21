import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { JobPanel } from "../components/job/job-panel"
import type { JobView } from "../../lib/job-view"
import { withWidgetBoundary } from "../components/widget-error-boundary"

/**
 * The one panel at the top of the Medusa order page: header, phase strip,
 * next action and the five tabs that hold what used to be 27 stacked widgets
 * (now in components/job/widgets). Docs/ADMIN_WORKFLOW_CONSOLIDATION_2026_10.md.
 */
const OrderJobPanelWidget = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [job, setJob] = useState<JobView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<AdminOrder>(data)

  const load = useCallback(async () => {
    try {
      const [j, o] = await Promise.all([
        fetch(`/admin/jobs/${encodeURIComponent(data.id)}`, { credentials: "include" }).then(async (r) => {
          const json = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`)
          return json.job as JobView
        }),
        fetch(`/admin/orders/${encodeURIComponent(data.id)}`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => (json?.order as AdminOrder | undefined) ?? null)
          .catch(() => null),
      ])
      setJob(j)
      if (o) setOrder(o)
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? "Failed to load job")
    }
  }, [data.id])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-error">Job panel: {error}</Text>
      </Container>
    )
  }
  if (!job) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-muted">Loading job…</Text>
      </Container>
    )
  }
  return <JobPanel job={job} order={order} onChanged={load} />
}

export const config = defineWidgetConfig({ zone: "order.details.before" })

export default withWidgetBoundary(OrderJobPanelWidget, "order-job-panel")
