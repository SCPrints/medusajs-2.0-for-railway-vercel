import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { TASK_MODULE } from "../../../../../modules/task"
import { getJob } from "../../../../../services/jobs/build"
import { bustTodayCache } from "../../../../../services/jobs/today"

const schema = z.object({
  /** Sydney calendar date, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(200).optional(),
})

const SYDNEY_UTC_OFFSET_HOURS = 10

/**
 * POST /admin/jobs/:id/follow-up { date, note? }
 *
 * "Follow up on <date>": a task for the job's owner (or whoever set it), due
 * at the start of that Sydney day. While it's in the future a job waiting on
 * the customer is parked — no nudge, sorted last; on the day it becomes
 * "Follow up" (lib/job-state.ts). Answering the customer closes a due one.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Pick a date to follow up on." })
  const actor = (req as any).auth_context?.actor_id ?? null

  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }

  // ponytail: fixed AEST offset — midnight in winter, 1 am in summer. Either way
  // it's due before anyone opens Today that morning.
  const dueAt = new Date(Date.parse(`${parsed.data.date}T00:00:00Z`) - SYDNEY_UTC_OFFSET_HOURS * 3_600_000)
  const assignee = job.owner?.user_id ?? actor
  if (!assignee) return res.status(400).json({ error: "No owner to give the follow-up to." })

  const tasks = req.scope.resolve(TASK_MODULE) as any
  await tasks.createTasks({
    assignee_user_id: assignee,
    order_id: job.order?.id ?? null,
    quote_id: job.quote?.id ?? null,
    customer_id: job.customer.id ?? null,
    title: `Follow up: ${parsed.data.note || job.customer.name || job.customer.email || "customer"}`,
    due_at: dueAt,
    priority: "normal",
    created_by: actor,
    metadata: { follow_up: true },
  })
  bustTodayCache()

  return res.json({ ok: true, job: await getJob(req.scope, req.params.id) })
}
