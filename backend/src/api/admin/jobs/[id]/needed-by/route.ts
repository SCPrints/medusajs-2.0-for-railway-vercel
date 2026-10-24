import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"

import { mergeOrderMetadata } from "../../../../../lib/order-metadata"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import { getJob } from "../../../../../services/jobs/build"
import { bustTodayCache } from "../../../../../services/jobs/today"

const schema = z.object({
  /** YYYY-MM-DD, or null to clear. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

/**
 * POST /admin/jobs/:id/needed-by { date | null }
 *
 * The customer's own date ("the carnival is on the 3rd"). Stored on the
 * quote and, when there is one, the order; Today flags the job late or at
 * risk against it (lib/job-today.ts dateRisk).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = schema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: "Date must be YYYY-MM-DD." })

  let job
  try {
    job = await getJob(req.scope, req.params.id)
  } catch (err: any) {
    return res.status(404).json({ error: err?.message ?? "not found" })
  }
  const date = parsed.data.date

  if (job.quote) {
    const quotes = req.scope.resolve(QUOTE_MODULE) as any
    const q = await quotes.retrieveQuote(job.quote.id)
    const { needed_by: _old, ...rest } = (q.metadata ?? {}) as Record<string, unknown>
    await quotes.updateQuotes([{ id: job.quote.id, metadata: { ...rest, ...(date ? { needed_by: date } : {}) } }])
  }
  if (job.order) {
    await mergeOrderMetadata(req.scope, job.order.id, date ? { needed_by: date } : {}, date ? {} : { unset: ["needed_by"] })
  }
  bustTodayCache()
  return res.json({ ok: true, job: await getJob(req.scope, req.params.id) })
}
