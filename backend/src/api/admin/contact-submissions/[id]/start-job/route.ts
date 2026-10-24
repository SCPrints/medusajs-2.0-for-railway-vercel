import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ulid } from "ulid"

import { listContactSubmissions } from "../../../../../lib/contact-submissions"
import { QUOTE_MODULE } from "../../../../../modules/quote"
import { bustTodayCache } from "../../../../../services/jobs/today"

/**
 * POST /admin/contact-submissions/:id/start-job → { quote_id }
 *
 * Turns a contact-form enquiry into a job: a `new` quote carrying the
 * sender's details, their message and attachments (as the mood board), so
 * it lands on Today under "To quote" and the reply goes from the diary.
 * Idempotent: a submission that already started a job returns that job.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = req.params.id
  const quotes = req.scope.resolve(QUOTE_MODULE) as any

  // ponytail: jsonb filters on the module aren't reliable; scan the newest
  // contact-sourced quotes instead (a few hundred at most).
  const recent: any[] = await quotes
    .listQuotes({ source: "contact" }, { take: 500, order: { created_at: "DESC" }, select: ["id", "metadata"] })
    .catch(() => [])
  const existing = recent.find((q) => q?.metadata?.contact_submission_id === id)
  if (existing?.id) return res.json({ quote_id: existing.id, existed: true })

  // ponytail: the submissions lib has no by-id reader; the list is capped at
  // 500 newest, which is every enquiry anyone would start a job from.
  const { rows } = await listContactSubmissions({ q: "", limit: 500 })
  const s = rows.find((r) => r.id === id)
  if (!s) return res.status(404).json({ error: "Enquiry not found" })

  const actor = (req as any).auth_context?.actor_id ?? "staff"
  const publicId = `Q-${ulid().slice(-10).toUpperCase()}`
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || null
  const attachments = (s.attachments ?? []).map((a) => a.url).filter(Boolean)

  const [quote] = await quotes.createQuotes([
    {
      public_id: publicId,
      status: "new",
      source: "contact",
      email: s.email,
      contact_name: name,
      contact_phone: s.phone ?? null,
      subject: s.subject ?? null,
      message: s.message,
      line_items: { items: [] },
      metadata: {
        contact_submission_id: id,
        enquiry_received_at: s.created_at,
        ...(attachments.length ? { mood_board_urls: attachments } : {}),
      },
    },
  ])
  await quotes.createQuoteEvents([
    { quote_id: quote.id, type: "created", actor, body: { source: "contact", public_id: publicId, contact_submission_id: id } },
  ])
  bustTodayCache()
  return res.json({ quote_id: quote.id, existed: false })
}
