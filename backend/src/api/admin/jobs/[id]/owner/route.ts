import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { AUDIT_ENTITY } from "../../../../../lib/audit-entities"
import { clearOwner, setOwner } from "../../../../../lib/crm-owners"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import { getJob } from "../../../../../services/jobs/build"
import { bustTodayCache } from "../../../../../services/jobs/today"

const schema = z.object({ user_id: z.string().min(1).optional() })

/**
 * POST /admin/jobs/:id/owner { user_id? } — "Take it". Makes someone (default:
 * whoever clicked) the job's owner: the quote's assigned_to and, when there
 * is one, the order's owner. The Jobs list's "Mine" folder reads it back.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  const actor = (req as any).auth_context?.actor_id ?? null
  const userId = (parsed.success && parsed.data.user_id) || actor
  if (!userId) return res.status(400).json({ error: "user_id required" })

  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }

  if (job.quote) {
    const quotes = req.scope.resolve(QUOTE_MODULE) as any
    const q = await quotes.retrieveQuote(job.quote.id)
    if (q.assigned_to !== userId) {
      await quotes.updateQuotes([{ id: q.id, assigned_to: userId }])
      await quotes.createQuoteEvents([{ quote_id: q.id, type: "assigned", actor, body: { from: q.assigned_to ?? null, to: userId } }])
    }
  }
  if (job.order) {
    await setOwner({ container: req.scope as any, entity: AUDIT_ENTITY.ORDER, entity_id: job.order.id, user_id: userId, actor, reason: "Take it" })
  }
  bustTodayCache()
  return res.json({ ok: true, job: await getJob(req.scope, req.params.id) })
}

/** DELETE /admin/jobs/:id/owner — undoes "Take it": the job has no owner again. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const actor = (req as any).auth_context?.actor_id ?? null
  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }
  if (job.quote) {
    const quotes = req.scope.resolve(QUOTE_MODULE) as any
    const q = await quotes.retrieveQuote(job.quote.id)
    if (q.assigned_to) {
      await quotes.updateQuotes([{ id: q.id, assigned_to: null }])
      await quotes.createQuoteEvents([{ quote_id: q.id, type: "assigned", actor, body: { from: q.assigned_to, to: null } }])
    }
  }
  if (job.order) {
    await clearOwner({ container: req.scope as any, entity: AUDIT_ENTITY.ORDER, entity_id: job.order.id, actor })
  }
  bustTodayCache()
  return res.json({ ok: true })
}
