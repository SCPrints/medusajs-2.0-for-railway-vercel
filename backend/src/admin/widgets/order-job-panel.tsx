import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

import type { JobView } from "../../lib/job-view"
import { withWidgetBoundary } from "../components/widget-error-boundary"

const WAIT: Record<string, { color: "red" | "blue" | "orange"; label: string }> = {
  us: { color: "red", label: "Waiting on us" },
  customer: { color: "blue", label: "Waiting on customer" },
  supplier: { color: "orange", label: "Waiting on supplier" },
}

const PHASE: Record<string, string> = {
  enquiry: "Enquiry", quoted: "Quoted", accepted: "Accepted", paid: "Paid", artwork: "Artwork",
  blanks: "Blanks", production: "In production", shipped: "Shipped", delivered: "Delivered",
}

/**
 * One line at the top of Medusa's own order page pointing at the job window
 * (/app/jobs/:id), where staff work the job. Medusa's sections below stay as
 * they are: this is where refunds, order edits, returns, cancelling, capture
 * and address/email changes live (Docs/ADMIN_JOB_WINDOW_2026_10.md — no
 * redirect, because that would strand those).
 */
const OrderJobBar = ({ data }: DetailWidgetProps<AdminOrder>) => {
  const [job, setJob] = useState<JobView | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/admin/jobs/${encodeURIComponent(data.id)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (live && json?.job) setJob(json.job as JobView) })
      .catch(() => undefined)
    return () => { live = false }
  }, [data.id])

  const wait = job?.state.waiting_on ? WAIT[job.state.waiting_on] : null
  return (
    <Container className="flex flex-wrap items-center gap-3 py-3">
      <Text weight="plus">Job #{data.display_id}</Text>
      {job ? (
        <>
          <Badge size="2xsmall">{PHASE[job.state.phase] ?? job.state.phase}</Badge>
          {wait ? <Badge size="2xsmall" color={wait.color}>{wait.label}</Badge> : null}
          {job.state.next_action.kind !== "none" ? (
            <Text size="small" className="text-ui-fg-subtle">Next: {job.state.next_action.label}</Text>
          ) : null}
        </>
      ) : null}
      <Text size="small" className="text-ui-fg-muted">Refunds, edits and cancelling are on this page.</Text>
      <Button size="small" className="ml-auto" asChild>
        <a href={`/app/jobs/${encodeURIComponent(data.id)}`}>Open job →</a>
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.before" })

export default withWidgetBoundary(OrderJobBar, "order-job-bar")
