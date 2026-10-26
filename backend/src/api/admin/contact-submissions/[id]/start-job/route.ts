import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { listContactSubmissions } from "../../../../../lib/contact-submissions"
import { startJobFromEnquiry } from "../../../../../services/jobs/start-from-enquiry"

/**
 * POST /admin/contact-submissions/:id/start-job → { quote_id }
 *
 * For enquiries that arrived before the contact form started creating jobs
 * itself (2026-10-27). Idempotent: a submission that already has a job
 * returns that job.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id

  // ponytail: the submissions lib has no by-id reader; the list is capped at
  // 500 newest, which is every enquiry anyone would start a job from.
  const { rows } = await listContactSubmissions({ q: "", limit: 500 })
  const s = rows.find((r) => r.id === id)
  if (!s) return res.status(404).json({ error: "Enquiry not found" })

  const actor = (req as any).auth_context?.actor_id ?? "staff"
  const job = await startJobFromEnquiry(req.scope, s, actor)
  return res.json({ quote_id: job.quote_id, existed: job.existed })
}
