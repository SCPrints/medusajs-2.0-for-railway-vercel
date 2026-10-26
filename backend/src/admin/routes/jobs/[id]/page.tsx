import type { AdminOrder } from "@medusajs/framework/types"
import { Container, Text } from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom"

import { JobPanel } from "../../../components/job/job-panel"
import type { JobView } from "../../../../lib/job-view"

/**
 * /app/jobs/:id — one page per job, for any id staff have to hand: order id,
 * quote id, "Q-…" public id or an order number. For an order job this is the
 * same panel the order page shows; for a quote it is the pre-order view.
 *
 * Moving between jobs is in-app now, so this page stays mounted: the id comes
 * from the router and the panel is keyed by job, so no state carries over.
 */
const JobPage = () => {
  const id = decodeURIComponent(useParams().id ?? "")
  const [job, setJob] = useState<JobView | null>(null)
  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = useRef(id)
  current.current = id

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/admin/jobs/${encodeURIComponent(id)}`, { credentials: "include" })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`)
      const j = json.job as JobView
      const o = j.order
        ? await fetch(`/admin/orders/${encodeURIComponent(j.order.id)}`, { credentials: "include" })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : null
      // A slow response for the job we just left must not overwrite this one.
      if (current.current !== id) return
      setJob(j)
      setOrder((o?.order as AdminOrder | undefined) ?? null)
      setError(null)
    } catch (err: any) {
      if (current.current === id) setError(err?.message ?? "Failed to load job")
    }
  }, [id])

  useEffect(() => {
    setJob(null)
    setOrder(null)
    setError(null)
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
  return <JobPanel key={job.id} job={job} order={order} onChanged={load} />
}

export default JobPage
