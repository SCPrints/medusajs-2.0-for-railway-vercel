import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { AUDIT_ACTION, AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { writeAudit } from "../../../../../lib/audit-log"
import { jobTaskFilter } from "../../../../../lib/job-tasks"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import { TASK_MODULE } from "../../../../../modules/task"
import { getJob, resolveJobIds } from "../../../../../services/jobs/build"
import { bustTodayCache } from "../../../../../services/jobs/today"

const schema = z.object({
  /** The job that handled it: order number, Q-id, order_… or qt_… id. */
  of: z.string().trim().min(1).max(80),
})

/**
 * POST /admin/jobs/:id/close-duplicate { of }
 *
 * Closes an enquiry that was answered on another job (a customer wrote twice).
 * The quote goes to "lost" so it leaves the live folders, but carries
 * metadata.closed_reason = "duplicate" so it reads "Handled on #122", sits in
 * Done, and never counts as a lost sale. Its open tasks are closed.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Which job handled it? Give its order number or Q- id." })

  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }
  if (!job.quote || job.order) {
    return res.status(400).json({ error: "Only an enquiry or quote with no order can be closed as handled elsewhere." })
  }

  const other = await resolveJobIds(req.scope, parsed.data.of.replace(/^#/, ""))
  const otherId = other.orderId ?? other.quoteId
  if (!otherId) return res.status(404).json({ error: `No job matches "${parsed.data.of}".` })
  if (other.quoteId === job.quote.id) return res.status(400).json({ error: "That's this job." })
  const otherJob = await getJob(req.scope, otherId)
  const label = otherJob.order?.display_id != null ? `#${otherJob.order.display_id}` : otherJob.quote?.public_id ?? otherId

  const actor = (req as any).auth_context?.actor_id ?? null
  const quotes = req.scope.resolve(QUOTE_MODULE) as any
  const q = await quotes.retrieveQuote(job.quote.id)
  const now = new Date()
  await quotes.updateQuotes([
    {
      id: q.id,
      status: "lost",
      lost_at: now,
      metadata: { ...(q.metadata ?? {}), closed_reason: "duplicate", duplicate_of: otherJob.id, duplicate_of_label: label },
    },
  ])
  await quotes
    .createQuoteEvents([{ quote_id: q.id, type: "status_changed", actor: actor ?? "staff", body: { from: q.status, to: "lost", reason: "duplicate", handled_on: label } }])
    .catch(() => undefined)

  const tasks = req.scope.resolve(TASK_MODULE) as any
  const open = await tasks.listTasks(jobTaskFilter(null, q.id), { take: 50 }).catch(() => [])
  for (const t of open as any[]) {
    await tasks.updateTasks({ id: t.id, status: "done", completed_at: now, completed_by: actor ?? "staff" })
  }

  await writeAudit({
    container: req.scope,
    entity: AUDIT_ENTITY.QUOTE,
    entity_id: q.id,
    action: AUDIT_ACTION.STATUS_CHANGED,
    actor_id: actor,
    details: { to: "lost", reason: "duplicate", handled_on: otherJob.id },
  })

  bustTodayCache()
  return res.json({ ok: true, job: await getJob(req.scope, req.params.id) })
}
