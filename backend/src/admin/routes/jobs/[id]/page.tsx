import type { AdminOrder } from "@medusajs/framework/types"
import { Container, Text } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"

import { JobPanel } from "../../../components/job/job-panel"
import type { JobView } from "../../../../lib/job-view"

/**
 * /app/jobs/:id — one page per job, for any id staff have to hand: order id,
 * quote id, "Q-…" public id or an order number. For an order job this is the
 * same panel the order page shows; for a quote it is the pre-order view.
 */
const JobPage = () => {
  // ponytail: react-router-dom isn't a direct dep (pnpm strict), so read the
  // id off the path: /app/jobs/<id>.
  const id = decodeURIComponent(window.location.pathname.split("/jobs/")[1]?.split(/[/?#]/)[0] ?? "")
  const [job, setJob] = useState<JobView | null>(null)
  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/admin/jobs/${encodeURIComponent(id)}`, { credentials: "include" })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`)
      const j = json.job as JobView
      setJob(j)
      if (j.order) {
        const o = await fetch(`/admin/orders/${encodeURIComponent(j.order.id)}`, { credentials: "include" })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
        setOrder((o?.order as AdminOrder | undefined) ?? null)
      } else {
        setOrder(null)
      }
      setError(null)
    } catch (err: any) {
      setError(err?.message ?? "Failed to load job")
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-error">{error}</Text>
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

export default JobPage
