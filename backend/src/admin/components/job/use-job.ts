import type { AdminOrder } from "@medusajs/framework/types"
import { useCallback, useEffect, useRef, useState } from "react"

import type { JobView } from "../../../lib/job-view"

/**
 * Loads one job (any id staff have to hand: order id, quote id, "Q-…" or an
 * order number) plus its Medusa order, which the moved widgets take as
 * `data`. Null id = nothing open. A slow answer for a job you've already
 * left never overwrites the one you're on.
 */
export function useJob(id: string | null) {
  const [job, setJob] = useState<JobView | null>(null)
  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = useRef(id)
  current.current = id

  const reload = useCallback(async () => {
    if (!id) return
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
    void reload()
  }, [reload])

  return { job, order, error, reload }
}
